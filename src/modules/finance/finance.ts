import type { Budget, Recurring, Transaction, TxType } from '../../lib/types';
import type { Period, PeriodKind } from '../../lib/utils';
import { inPeriod, sum, periodRange, todayKey, dateKey, addDays, parseLocal, download, dayOf, timeOf } from '../../lib/utils';
import { data, category, accountLabel } from '../../lib/store.svelte';

export function txIn(p: Period, filter?: (t: Transaction) => boolean): Transaction[] {
  return data.transactions
    .filter((t) => inPeriod(t.date, p) && (!filter || filter(t)))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function totals(list: Transaction[]) {
  const income = sum(list, (t) => (t.type === 'income' ? t.amount : 0));
  const expense = sum(list, (t) => (t.type === 'expense' ? t.amount : 0));
  return { income, expense, balance: income - expense };
}

export interface Bucket {
  id: string;
  name: string;
  icon: string;
  color?: string;
  amount: number;
  count: number;
}

export function byCategory(list: Transaction[], type: TxType): Bucket[] {
  const m = new Map<string, Bucket>();
  for (const t of list) {
    if (t.type !== type) continue;
    const c = category(t.categoryId);
    const b = m.get(t.categoryId) ?? { id: t.categoryId, name: c?.name ?? 'Без категории', icon: c?.icon ?? '❔', amount: 0, count: 0 };
    b.amount += t.amount;
    b.count++;
    m.set(t.categoryId, b);
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount);
}

export const SOURCE_NAMES: Record<string, string> = {
  smoking: 'Курение',
  groceries: 'Покупки',
  health: 'Врачи',
  tracker: 'Свой трекер',
  recurring: 'Регулярные платежи',
};

/** Сравнимый прошлый период. Для текущего периода берём такой же отрезок (1–18 октября против 1–18 ноября). */
export function previousPeriod(kind: PeriodKind, offset: number): Period | null {
  if (kind === 'all' || kind === 'day') return null;
  const prev = periodRange(kind, offset - 1);
  if (offset !== 0) return prev;
  const cur = periodRange(kind, 0);
  const elapsed = Math.round((parseLocal(todayKey()).getTime() - parseLocal(cur.start).getTime()) / 86400000) + 1;
  const end = dateKey(addDays(parseLocal(prev.start), elapsed));
  return { ...prev, end: end < prev.end ? end : prev.end };
}

/** изменение в процентах; null, если сравнивать не с чем */
export function deltaPct(cur: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

/* ---------- Бюджеты ---------- */

export interface BudgetStatus {
  budget: Budget;
  name: string;
  icon: string;
  spent: number;
  left: number;
  pct: number;
  /** сколько можно тратить в день до конца месяца */
  perDay: number;
  /** прогноз на конец месяца при текущем темпе */
  forecast: number;
}

export function budgetStatuses(): BudgetStatus[] {
  const p = periodRange('month');
  const monthTx = data.transactions.filter((t) => t.type === 'expense' && inPeriod(t.date, p));
  const today = parseLocal(todayKey());
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const dayN = today.getDate();
  const daysLeft = daysInMonth - dayN + 1;
  return data.budgets
    .map((b) => {
      const c = category(b.categoryId);
      const spent = sum(monthTx.filter((t) => !b.categoryId || t.categoryId === b.categoryId), (t) => t.amount);
      const left = b.amount - spent;
      return {
        budget: b,
        name: b.categoryId ? (c?.name ?? 'Категория') : 'Все расходы',
        icon: b.categoryId ? (c?.icon ?? '❔') : '💶',
        spent,
        left,
        pct: b.amount ? Math.round((spent / b.amount) * 100) : 0,
        perDay: Math.max(0, Math.floor(left / daysLeft)),
        forecast: Math.round((spent / dayN) * daysInMonth),
      };
    })
    .sort((a, b) => (a.budget.categoryId ? 1 : 0) - (b.budget.categoryId ? 1 : 0) || b.pct - a.pct);
}

export const budgetColor = (pct: number) => (pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--orange)' : 'var(--green)');

/* ---------- Частые операции (шаблоны в один тап) ---------- */

export interface Frequent {
  key: string;
  type: TxType;
  amount: number;
  categoryId: string;
  accountId: string;
  note?: string;
  count: number;
}

export function frequentTx(type: TxType, limit = 6): Frequent[] {
  const since = dateKey(addDays(new Date(), -120));
  const m = new Map<string, Frequent & { last: string }>();
  for (const t of data.transactions) {
    if (t.type !== type || t.source || t.date < since) continue;
    const key = [t.categoryId, t.accountId, t.amount, (t.note ?? '').trim().toLowerCase()].join('|');
    const f = m.get(key);
    if (f) {
      f.count++;
      if (t.date > f.last) f.last = t.date;
    } else {
      m.set(key, { key, type, amount: t.amount, categoryId: t.categoryId, accountId: t.accountId, note: t.note, count: 1, last: t.date });
    }
  }
  return [...m.values()]
    .filter((f) => f.count >= 2)
    .sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1))
    .slice(0, limit);
}

/* ---------- Регулярные ---------- */

/** сумма в пересчёте на месяц */
export function monthlyEquivalent(r: Recurring): number {
  if (r.freq === 'weekly') return Math.round((r.amount * 52) / 12);
  if (r.freq === 'yearly') return Math.round(r.amount / 12);
  return r.amount;
}

export const FREQ_NAMES: Record<string, string> = { weekly: 'каждую неделю', monthly: 'каждый месяц', yearly: 'каждый год' };

/** платежи в ближайшие n дней (и просроченные ручные) */
export function upcomingRecurring(days = 7): Recurring[] {
  const until = dateKey(addDays(new Date(), days));
  return data.recurring.filter((r) => r.active && r.nextDate <= until).sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1));
}

/* ---------- Экспорт CSV ---------- */

export function exportCsv(list: Transaction[], filename: string) {
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = [['Дата', 'Время', 'Тип', 'Сумма', 'Категория', 'Счёт', 'Комментарий', 'Источник']];
  for (const t of [...list].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    rows.push([
      dayOf(t.date),
      timeOf(t.date),
      t.type === 'income' ? 'Доход' : 'Расход',
      ((t.type === 'income' ? 1 : -1) * t.amount / 100).toFixed(2).replace('.', ','),
      category(t.categoryId)?.name ?? '',
      accountLabel(t.accountId),
      t.note ?? '',
      t.source ? SOURCE_NAMES[t.source.module] ?? '' : '',
    ]);
  }
  // BOM + «;» — Excel с европейской локалью откроет сразу корректно
  download(filename, '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}
