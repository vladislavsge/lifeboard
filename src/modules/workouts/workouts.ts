import type { ExKind, Program, ProgramDay, Workout, WSet, WExercise } from '../../lib/types';
import { data, add, exercise, lastSets, activeWorkout, find } from '../../lib/store.svelte';
import { PROGRAM_TEMPLATES } from '../../data/exercises';
import { uid, nowLocal, isoWeekday, parseLocal, dayOf, fmtNum, addDays, dateKey } from '../../lib/utils';
import { downloadIcs, type IcsEvent } from '../../lib/ics';

export const KIND_UNITS: Record<ExKind, string> = {
  strength: 'кг × повт',
  reps: 'повторы',
  time: 'время',
  cardio: 'мин / км',
};

/** «3 × 10 · 60 кг», «60×10, 65×8», «30 мин · 5 км» */
export function setsSummary(kind: ExKind, sets: WSet[]): string {
  const s = sets.filter((x) => x.reps || x.weight || x.duration || x.distance);
  if (!s.length) return sets.length ? `${sets.length} подх.` : '—';
  if (kind === 'cardio') {
    const min = Math.round(s.reduce((a, x) => a + (x.duration ?? 0), 0) / 60);
    const km = s.reduce((a, x) => a + (x.distance ?? 0), 0);
    return [min ? `${min} мин` : '', km ? `${fmtNum(km, 2)} км` : ''].filter(Boolean).join(' · ') || '—';
  }
  if (kind === 'time') {
    const same = s.every((x) => x.duration === s[0].duration);
    const f = (sec = 0) => (sec >= 60 && sec % 60 === 0 ? `${sec / 60} мин` : `${sec} сек`);
    return same ? `${s.length} × ${f(s[0].duration)}` : s.map((x) => f(x.duration)).join(', ');
  }
  if (kind === 'reps') {
    const same = s.every((x) => x.reps === s[0].reps && x.weight === s[0].weight);
    const w = s[0].weight ? ` · +${fmtNum(s[0].weight)} кг` : '';
    return same ? `${s.length} × ${s[0].reps ?? 0}${w}` : s.map((x) => x.reps ?? 0).join(', ');
  }
  const same = s.every((x) => x.reps === s[0].reps && x.weight === s[0].weight);
  if (same) return `${s.length} × ${s[0].reps ?? 0}${s[0].weight ? ` · ${fmtNum(s[0].weight)} кг` : ''}`;
  return s.map((x) => `${fmtNum(x.weight ?? 0)}×${x.reps ?? 0}`).join(', ');
}

export function workoutStats(w: Workout) {
  let sets = 0;
  let volume = 0;
  for (const e of w.exercises) {
    for (const s of e.sets) {
      if (!s.done) continue;
      sets++;
      if (s.weight && s.reps) volume += s.weight * s.reps;
    }
  }
  return { exercises: w.exercises.length, sets, volume: Math.round(volume) };
}

export function inferType(exIds: string[]): string {
  const kinds = exIds.map((id) => exercise(id));
  if (!kinds.length) return 'strength';
  if (kinds.every((e) => e.group === 'Кардио')) return 'cardio';
  if (kinds.every((e) => e.group === 'Растяжка')) return 'stretch';
  if (kinds.every((e) => e.group === 'Единоборства')) return 'martial';
  if (kinds.every((e) => e.group === 'Спорт')) return 'sport';
  return 'strength';
}

/** подходы для упражнения: из программы, иначе как в прошлый раз, иначе 3 пустых */
export function makeSets(exerciseId: string, done: boolean, target?: { sets?: number; reps?: number; weight?: number; duration?: number; distance?: number }): WSet[] {
  const last = lastSets(exerciseId);
  const ex = exercise(exerciseId);
  const n = target?.sets || last?.sets.length || (ex.kind === 'cardio' || ex.kind === 'time' && ex.group !== 'Пресс' ? 1 : 3);
  return Array.from({ length: n }, (_, i) => {
    const prev = last?.sets[i] ?? last?.sets[last.sets.length - 1];
    return {
      reps: target?.reps || prev?.reps,
      weight: target?.weight ?? prev?.weight,
      duration: target?.duration || prev?.duration,
      distance: target?.distance ?? prev?.distance,
      done,
    };
  });
}

export function makeExercise(exerciseId: string, done: boolean): WExercise {
  return { uid: uid(), exerciseId, sets: makeSets(exerciseId, done) };
}

/** Начать тренировку (пустую или по дню программы). Если уже идёт — вернуть её. */
export function startWorkout(opts: { programId?: string; dayId?: string } = {}): string {
  const cur = activeWorkout();
  if (cur) return cur.id;
  const program = find('programs', opts.programId);
  const day = program?.days.find((d) => d.id === opts.dayId);
  const exercises: WExercise[] = (day?.exercises ?? []).map((pe) => ({
    uid: uid(),
    exerciseId: pe.exerciseId,
    sets: makeSets(pe.exerciseId, false, pe),
  }));
  const w: Workout = {
    id: uid(),
    title: day?.name ?? 'Тренировка',
    type: inferType(exercises.map((e) => e.exerciseId)),
    date: nowLocal(),
    startedAt: Date.now(),
    status: 'active',
    programId: program?.id,
    dayId: day?.id,
    exercises,
  };
  return add('workouts', w).id;
}

/** Записать прошедшую тренировку задним числом */
export function logPastWorkout(): string {
  const w: Workout = {
    id: uid(),
    title: 'Тренировка',
    type: 'strength',
    date: nowLocal(),
    duration: 60,
    status: 'done',
    exercises: [],
    draft: true,
  };
  return add('workouts', w).id;
}

/** Расписание программы → события в календаре телефона (повтор каждую неделю, напоминание за 30 мин) */
export function programToIcs(p: Program) {
  const events: IcsEvent[] = [];
  for (const d of p.days) {
    if (!d.weekdays.length) continue;
    // первое занятие — ближайший подходящий день, начиная с сегодня
    let start = new Date();
    for (let i = 0; i < 7; i++) {
      const x = addDays(new Date(), i);
      if (d.weekdays.includes(isoWeekday(x))) {
        start = x;
        break;
      }
    }
    const names = d.exercises.map((e) => '• ' + exercise(e.exerciseId).name + ' — ' + targetSummary(e));
    events.push({
      uid: `${p.id}-${d.id}`,
      start: `${dateKey(start)}T${d.time || '19:00'}`,
      minutes: 75,
      title: `🏋️ ${d.name}`,
      description: [p.name, ...names].join('\n'),
      alarms: [30],
      weekly: d.weekdays,
    });
  }
  if (events.length) downloadIcs(`trenirovki-${p.name.toLowerCase().replace(/[^\p{L}\d]+/gu, '-')}.ics`, events);
  return events.length;
}

export interface Planned {
  program: Program;
  day: ProgramDay;
  done?: Workout;
}

/** Что запланировано по активным программам на дату "YYYY-MM-DD" */
export function plannedOn(key: string): Planned[] {
  const wd = isoWeekday(parseLocal(key));
  const res: Planned[] = [];
  for (const p of data.programs) {
    if (!p.active) continue;
    for (const d of p.days) {
      if (!d.weekdays.includes(wd)) continue;
      const done = data.workouts.find((w) => w.status === 'done' && w.dayId === d.id && dayOf(w.date) === key);
      res.push({ program: p, day: d, done });
    }
  }
  return res.sort((a, b) => (a.day.time ?? '').localeCompare(b.day.time ?? ''));
}

export function programFromTemplate(i: number): Program {
  const t = PROGRAM_TEMPLATES[i];
  return {
    id: uid(),
    name: t.name,
    note: t.note,
    active: true,
    days: t.days.map((d) => ({
      id: uid(),
      name: d.name,
      weekdays: [...d.weekdays],
      time: d.time,
      exercises: d.ex.map(([exerciseId, sets, reps, duration]) => ({
        uid: uid(),
        exerciseId,
        sets,
        reps: reps || undefined,
        duration: duration || undefined,
      })),
    })),
  };
}

export function targetSummary(pe: { exerciseId: string; sets: number; reps?: number; weight?: number; duration?: number; distance?: number }): string {
  const k = exercise(pe.exerciseId).kind;
  if (k === 'cardio') {
    return [pe.duration ? `${Math.round(pe.duration / 60)} мин` : '', pe.distance ? `${fmtNum(pe.distance, 2)} км` : ''].filter(Boolean).join(' · ') || 'кардио';
  }
  if (k === 'time') {
    const d = pe.duration ?? 0;
    return `${pe.sets} × ${d >= 60 && d % 60 === 0 ? d / 60 + ' мин' : d + ' сек'}`;
  }
  return `${pe.sets} × ${pe.reps ?? '?'}${pe.weight ? ` · ${fmtNum(pe.weight)} кг` : ''}`;
}
