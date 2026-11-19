// Расписание напоминаний считает клиент: он знает модель данных и местное
// время. Сервер получает готовый список «когда и какой текст» и только
// доставляет его — поэтому часовой пояс и структура данных ему не нужны.
import { advanceDate, data, isEnabled } from './store.svelte';
import { addDays, dateKey, isoWeekday, money, parseLocal, timeOf, todayKey } from './utils';
import { budgetStatuses } from '../modules/finance/finance';
import { countOn } from '../modules/smoking/smoking';
import { fmtGoal, goalDayValue, goalMet } from '../modules/custom/tracker';

const HORIZON_DAYS = 7;
const MAX_REMINDERS = 100;
/** Во сколько напоминать про бюджеты и регулярные платежи */
const BUDGET_AT = '19:00';
const PAYMENT_AT = '09:00';

export interface PlannedReminder {
  key: string;
  kind: 'goal' | 'recurring' | 'budget' | 'workout' | 'appointment';
  title: string;
  body: string;
  url?: string;
  /** момент отправки в UTC — переводим из местного времени здесь */
  sendAt: string;
}

const defaults = { goals: true, recurring: true, budgets: true, events: true, goalAt: '20:00' };
const notify = () => ({ ...defaults, ...(data.settings.notify ?? {}) });

/** Местные «день + ЧЧ:ММ» → момент в UTC */
const at = (dayKey: string, time: string): Date => parseLocal(dayKey + 'T' + time);

/** Готовое напоминание уже в прошлом отправлять не нужно */
const future = (d: Date, now: Date) => d.getTime() > now.getTime();

export function planReminders(now = new Date()): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  const cfg = notify();
  const today = todayKey();
  const horizonEnd = addDays(now, HORIZON_DAYS);
  const add = (r: PlannedReminder) => out.push(r);

  /* ---------- Цели и лимиты за день ---------- */
  if (cfg.goals) {
    for (const t of data.trackers) {
      if (!t.goal || !isEnabled('tracker:' + t.id)) continue;
      const when = at(today, cfg.goalAt);
      if (!future(when, now)) continue;
      const value = goalDayValue(t, today);

      if (t.goalMode === 'max') {
        if (value > t.goal) {
          add({
            key: `limit:${t.id}:${today}`,
            kind: 'goal',
            title: `${t.icon} ${t.name}`,
            body: `Лимит на сегодня превышен: ${fmtGoal(t, value)} при ${fmtGoal(t, t.goal)}`,
            url: '/t/' + t.id,
            sendAt: when.toISOString(),
          });
        }
      } else if (!goalMet(t, today)) {
        add({
          key: `goal:${t.id}:${today}`,
          kind: 'goal',
          title: `${t.icon} ${t.name}`,
          body: `Сегодня ${fmtGoal(t, value)} из ${fmtGoal(t, t.goal)} — ещё можно успеть`,
          url: '/t/' + t.id,
          sendAt: when.toISOString(),
        });
      }
    }

    // дневной лимит сигарет живёт в настройках курения, а не в трекерах
    const limit = data.settings.smokeLimit;
    if (isEnabled('smoking') && limit && limit > 0) {
      const smoked = countOn(today);
      const when = at(today, cfg.goalAt);
      if (smoked > limit && future(when, now)) {
        add({
          key: `smoke-limit:${today}`,
          kind: 'goal',
          title: '🚬 Курение',
          body: `Сегодня ${smoked} при дневном лимите ${limit}`,
          url: '/smoking',
          sendAt: when.toISOString(),
        });
      }
    }
  }

  /* ---------- Регулярные платежи ---------- */
  if (cfg.recurring && isEnabled('finance')) {
    const lastDay = dateKey(horizonEnd);
    for (const r of data.recurring) {
      if (!r.active) continue;
      let day = r.nextDate;
      for (let i = 0; i < 4 && day <= lastDay; i++) {
        const when = at(day, PAYMENT_AT);
        if (future(when, now)) {
          add({
            key: `recurring:${r.id}:${day}`,
            kind: 'recurring',
            title: r.type === 'income' ? '💰 Поступление' : '🔁 Регулярный платёж',
            body: r.auto
              ? `${r.name} · ${money(r.amount)} — сегодня`
              : `${r.name} · ${money(r.amount)} — подтвердите платёж`,
            url: '/finance/recurring',
            sendAt: when.toISOString(),
          });
        }
        day = advanceDate(day, r.freq, r.day);
      }
    }
  }

  /* ---------- Бюджеты ---------- */
  if (cfg.budgets && isEnabled('finance')) {
    const when = at(today, BUDGET_AT);
    if (future(when, now)) {
      for (const b of budgetStatuses()) {
        if (b.pct < 80) continue;
        add({
          key: `budget:${b.budget.id}:${today}`,
          kind: 'budget',
          title: `${b.icon} ${b.name}`,
          body:
            b.pct >= 100
              ? `Бюджет превышен: ${money(b.spent)} из ${money(b.budget.amount)}`
              : `Потрачено ${b.pct}% бюджета, осталось ${money(b.left)}`,
          url: '/finance/budgets',
          sendAt: when.toISOString(),
        });
      }
    }
  }

  /* ---------- Тренировки по программе ---------- */
  if (cfg.events && isEnabled('workouts')) {
    for (const program of data.programs) {
      if (!program.active) continue;
      for (let i = 0; i < HORIZON_DAYS; i++) {
        const date = addDays(now, i);
        const key = dateKey(date);
        const weekday = isoWeekday(date);
        for (const day of program.days) {
          if (!day.time || !day.weekdays.includes(weekday)) continue;
          // уже отметили эту тренировку — напоминать не о чем
          const done = data.workouts.some(
            (w) => w.status === 'done' && w.dayId === day.id && w.date.slice(0, 10) === key,
          );
          if (done) continue;
          const when = new Date(at(key, day.time).getTime() - 60 * 60 * 1000);
          if (!future(when, now)) continue;
          add({
            key: `workout:${program.id}:${day.id}:${key}`,
            kind: 'workout',
            title: '🏋️ Через час тренировка',
            body: `${day.name} · в ${day.time}`,
            url: '/workouts',
            sendAt: when.toISOString(),
          });
        }
      }
    }
  }

  /* ---------- Записи к врачам ---------- */
  if (cfg.events && isEnabled('health')) {
    for (const a of data.appointments) {
      if (a.status !== 'planned') continue;
      const when = parseLocal(a.date);
      if (when <= now || when > horizonEnd) continue;
      const who = a.doctorName ? `${a.specialty}, ${a.doctorName}` : a.specialty;

      const evening = at(dateKey(addDays(when, -1)), '20:00');
      if (future(evening, now)) {
        add({
          key: `appointment:${a.id}:eve`,
          kind: 'appointment',
          title: '🩺 Запись к врачу',
          body: `Завтра в ${timeOf(a.date)} — ${who}`,
          url: '/health',
          sendAt: evening.toISOString(),
        });
      }
      const twoHours = new Date(when.getTime() - 2 * 60 * 60 * 1000);
      if (future(twoHours, now)) {
        add({
          key: `appointment:${a.id}:2h`,
          kind: 'appointment',
          title: '🩺 Через два часа приём',
          body: `${timeOf(a.date)} — ${who}${a.clinic ? ' · ' + a.clinic : ''}`,
          url: '/health',
          sendAt: twoHours.toISOString(),
        });
      }
    }
  }

  return out.sort((a, b) => (a.sendAt < b.sendAt ? -1 : 1)).slice(0, MAX_REMINDERS);
}
