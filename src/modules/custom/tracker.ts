import type { Entry, EntryValue, Tracker, TrackerField } from '../../lib/types';
import type { Period } from '../../lib/utils';
import { data } from '../../lib/store.svelte';
import { money, fmtMinutes, fmtNum, dayOf, sum, todayKey, addDays, dateKey, parseLocal } from '../../lib/utils';

export const RATING_EMOJI = ['😣', '😕', '😐', '🙂', '😄'];

export function fmtValue(f: TrackerField, v: EntryValue): string {
  if (v === undefined || v === '' || v === null) return '';
  switch (f.type) {
    case 'money':
      return money(Number(v));
    case 'checkbox':
      return v ? '✓' : '✗';
    case 'rating':
      return RATING_EMOJI[Number(v) - 1] ?? String(v);
    case 'duration':
      return fmtMinutes(Number(v));
    case 'number':
      return `${fmtNum(Number(v), 2)}${f.unit ? ' ' + f.unit : ''}`;
    default:
      return String(v);
  }
}

/** краткое описание записи: «72,5 кг · 😄 · заметка» */
export function entrySummary(t: Tracker, e: Entry): string {
  const parts = t.fields.map((f) => fmtValue(f, e.values[f.id])).filter(Boolean);
  return parts.join(' · ') || e.note || 'Отметка';
}

export const entriesOf = (trackerId: string) =>
  data.entries.filter((e) => e.trackerId === trackerId).sort((a, b) => (a.date < b.date ? 1 : -1));

/** главное числовое поле — для графика и итогов */
export function primaryField(t: Tracker): TrackerField | undefined {
  return t.fields.find((f) => f.type === 'number' || f.type === 'money' || f.type === 'duration' || f.type === 'rating');
}

/** Единицы измерений, которые бессмысленно складывать за день */
const LAST_UNITS = ['кг', 'см', 'мм рт. ст.', 'ммоль/л', 'уд/мин', '°C'];

/** для веса и замеров логичнее «последнее значение» за день, для воды/кофе — сумма */
export function aggregate(t: Tracker, f: TrackerField): 'sum' | 'last' | 'avg' {
  if (f.type === 'rating') return 'avg';
  if (
    f.type === 'number' &&
    (LAST_UNITS.includes(f.unit ?? '') ||
      /вес|weight|давлен|темп|пульс|рост|замер|глюкоз|сахар|пробег|одометр/i.test(f.label + t.name))
  ) {
    return 'last';
  }
  return 'sum';
}

/* ---------- Цели ---------- */

/** поле, по которому считается цель (без оценок), или undefined — тогда считаем число записей */
export function goalField(t: Tracker): TrackerField | undefined {
  return t.fields.find((f) => f.type === 'number' || f.type === 'money' || f.type === 'duration');
}

export function goalDayValue(t: Tracker, key: string): number {
  const f = goalField(t);
  if (f) return dayValue(t, f, key);
  return data.entries.filter((e) => e.trackerId === t.id && dayOf(e.date) === key).length;
}

export function fmtGoal(t: Tracker, v: number): string {
  const f = goalField(t);
  if (!f) return `${fmtNum(v, 0)} зап.`;
  if (f.type === 'money') return money(Math.round(v));
  if (f.type === 'duration') return fmtMinutes(v);
  return `${fmtNum(v, 1)}${f.unit ? ' ' + f.unit : ''}`;
}

export function goalMet(t: Tracker, key: string): boolean {
  if (!t.goal) return false;
  const v = goalDayValue(t, key);
  return t.goalMode === 'max' ? v <= t.goal : v >= t.goal;
}

/** дней подряд с выполненной целью (сегодня считается, если уже выполнена) */
export function goalStreak(t: Tracker): number {
  if (!t.goal) return 0;
  const created = dayOf(t.createdAt);
  let d = new Date();
  if (!goalMet(t, todayKey())) d = addDays(d, -1);
  let n = 0;
  for (let i = 0; i < 730; i++) {
    const k = dateKey(d);
    if (k < created || !goalMet(t, k)) break;
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** в скольких днях периода цель выполнена (учитываем только прошедшие дни после создания трекера) */
export function goalProgress(t: Tracker, p: Period): { met: number; days: number } {
  if (!t.goal) return { met: 0, days: 0 };
  const created = dayOf(t.createdAt);
  const today = todayKey();
  let met = 0;
  let days = 0;
  let d = parseLocal(p.start > created ? p.start : created);
  for (let i = 0; i < 400; i++) {
    const k = dateKey(d);
    if (k >= p.end || k > today) break;
    // сегодняшний день для «не меньше» считаем, только если уже выполнено
    if (k === today && t.goalMode !== 'max' && !goalMet(t, k)) break;
    days++;
    if (goalMet(t, k)) met++;
    d = addDays(d, 1);
  }
  return { met, days };
}

/** primaryField оставлен для графиков (включает оценки) */
export const goalLabel = (t: Tracker) => (t.goalMode === 'max' ? 'не больше' : 'не меньше');

export function dayValue(t: Tracker, f: TrackerField, key: string): number {
  const list = data.entries.filter((e) => e.trackerId === t.id && dayOf(e.date) === key && typeof e.values[f.id] === 'number');
  if (!list.length) return 0;
  const mode = aggregate(t, f);
  if (mode === 'last') return Number(list.sort((a, b) => (a.date < b.date ? 1 : -1))[0].values[f.id]);
  const s = sum(list, (e) => Number(e.values[f.id]));
  return mode === 'avg' ? s / list.length : s;
}
