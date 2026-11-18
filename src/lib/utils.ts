// Общие помощники: id, даты, деньги, склонения, периоды.

export const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/* ---------- Даты ---------- */

export const pad = (n: number) => String(n).padStart(2, '0');

export function toLocal(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const nowLocal = () => toLocal(new Date());
export const dateKey = (d: Date) => toLocal(d).slice(0, 10);
export const todayKey = () => dateKey(new Date());
export const dayOf = (s: string) => s.slice(0, 10);
export const timeOf = (s: string) => s.slice(11, 16);

export function parseLocal(s: string): Date {
  const [d, t = '00:00'] = s.split('T');
  const [y, m, dd] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  return new Date(y, (m || 1) - 1, dd || 1, hh || 0, mm || 0);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** 1 = понедельник … 7 = воскресенье */
export const isoWeekday = (d: Date) => ((d.getDay() + 6) % 7) + 1;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - (isoWeekday(x) - 1));
  return x;
}

export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const WD_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const WD_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

/** «Сегодня», «Вчера», «18 ноября, ср» */
export function fmtDay(key: string): string {
  const today = todayKey();
  if (key === today) return 'Сегодня';
  if (key === dateKey(addDays(new Date(), -1))) return 'Вчера';
  if (key === dateKey(addDays(new Date(), 1))) return 'Завтра';
  const d = parseLocal(key);
  const year = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}${year}, ${WD_SHORT[isoWeekday(d) - 1].toLowerCase()}`;
}

export function fmtDateShort(key: string): string {
  const d = parseLocal(key);
  const year = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()].slice(0, 3)}${year}`;
}

export function fmtDateTime(s: string): string {
  return `${fmtDay(dayOf(s))}, ${timeOf(s)}`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** «2 ч 15 мин назад» */
export function relTime(s: string, now = Date.now()): string {
  const diff = Math.max(0, Math.round((now - parseLocal(s).getTime()) / 60000));
  if (diff < 1) return 'только что';
  if (diff < 60) return `${diff} мин назад`;
  const h = Math.floor(diff / 60);
  if (h < 24) {
    const m = diff % 60;
    return m ? `${h} ч ${m} мин назад` : `${h} ч назад`;
  }
  const d = Math.floor(h / 24);
  return `${d} ${plural(d, 'день', 'дня', 'дней')} назад`;
}

/** «через 3 дня», «сегодня в 14:00» */
export function untilText(s: string): string {
  const key = dayOf(s);
  const t = timeOf(s);
  const today = todayKey();
  if (key === today) return `сегодня в ${t}`;
  if (key === dateKey(addDays(new Date(), 1))) return `завтра в ${t}`;
  const days = Math.round((parseLocal(key).getTime() - startOfDay(new Date()).getTime()) / 86400000);
  if (days > 0) return `через ${days} ${plural(days, 'день', 'дня', 'дней')}`;
  return `${-days} ${plural(-days, 'день', 'дня', 'дней')} назад`;
}

/** минуты → «1 ч 25 мин» */
export function fmtMinutes(min?: number): string {
  if (!min) return '0 мин';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} мин`;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

/** секунды → «12:05» или «1:02:05» */
export function fmtClock(sec: number): string {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** секунды → «45 сек», «2 мин 30 сек» */
export function fmtSeconds(sec?: number): string {
  if (!sec) return '0 сек';
  if (sec < 60) return `${sec} сек`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) return fmtMinutes(Math.round(sec / 60));
  return s ? `${m} мин ${s} сек` : `${m} мин`;
}

/* ---------- Периоды ---------- */

export type PeriodKind = 'day' | 'week' | 'month' | 'year' | 'all';

export interface Period {
  start: string; // включительно, "YYYY-MM-DD"
  end: string; // не включительно
  label: string;
}

/** Строки дат сравниваются лексикографически: date >= start && date < end */
export function periodRange(kind: PeriodKind, offset = 0, base = new Date()): Period {
  if (kind === 'all') return { start: '0000', end: '9999', label: 'Всё время' };
  if (kind === 'day') {
    const d = addDays(startOfDay(base), offset);
    return { start: dateKey(d), end: dateKey(addDays(d, 1)), label: fmtDay(dateKey(d)) };
  }
  if (kind === 'week') {
    const s = addDays(startOfWeek(base), offset * 7);
    const e = addDays(s, 7);
    const last = addDays(e, -1);
    const label =
      s.getMonth() === last.getMonth()
        ? `${s.getDate()}–${last.getDate()} ${MONTHS_GEN[s.getMonth()]}`
        : `${s.getDate()} ${MONTHS_GEN[s.getMonth()].slice(0, 3)} – ${last.getDate()} ${MONTHS_GEN[last.getMonth()].slice(0, 3)}`;
    return { start: dateKey(s), end: dateKey(e), label };
  }
  if (kind === 'month') {
    const s = new Date(base.getFullYear(), base.getMonth() + offset, 1);
    const e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
    const year = s.getFullYear() !== base.getFullYear() ? ` ${s.getFullYear()}` : '';
    return { start: dateKey(s), end: dateKey(e), label: `${MONTHS[s.getMonth()]}${year}` };
  }
  const s = new Date(base.getFullYear() + offset, 0, 1);
  const e = new Date(s.getFullYear() + 1, 0, 1);
  return { start: dateKey(s), end: dateKey(e), label: String(s.getFullYear()) };
}

export const inPeriod = (date: string, p: Period) => date >= p.start && date < p.end;

/** ключи последних n дней (включая сегодня), от старых к новым */
export function lastDays(n: number): string[] {
  const today = startOfDay(new Date());
  return Array.from({ length: n }, (_, i) => dateKey(addDays(today, i - n + 1)));
}

/* ---------- Деньги ---------- */

let currency = 'EUR';
let fmt: Record<string, Intl.NumberFormat> = {};

export function setCurrency(c: string) {
  if (c !== currency) {
    currency = c;
    fmt = {};
  }
}

function formatter(frac: number): Intl.NumberFormat {
  const k = String(frac);
  if (!fmt[k]) {
    fmt[k] = new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      minimumFractionDigits: frac,
      maximumFractionDigits: frac,
    });
  }
  return fmt[k];
}

/** центы → «12,50 €» (целые суммы без копеек) */
export function money(cents: number | undefined, opts: { sign?: boolean; round?: boolean } = {}): string {
  const c = cents ?? 0;
  const frac = opts.round || c % 100 === 0 ? 0 : 2;
  const v = (opts.round ? Math.round(c / 100) : c / 100);
  const s = formatter(frac).format(Math.abs(v));
  if (opts.sign) return (c < 0 ? '−' : c > 0 ? '+' : '') + s;
  return c < 0 ? '−' + s : s;
}

export function currencySymbol(): string {
  return formatter(0).formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency;
}

/** «12,5» / «12.50» / «1 200» → центы; пусто/мусор → null */
export function parseMoney(s: string | number | undefined | null): number | null {
  if (s === undefined || s === null) return null;
  if (typeof s === 'number') return Number.isFinite(s) ? Math.round(s * 100) : null;
  const clean = s.replace(/\s/g, '').replace(',', '.');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function centsToInput(c?: number | null): string {
  if (c === undefined || c === null) return '';
  return (c / 100).toFixed(2).replace(/\.00$/, '').replace('.', ',');
}

/** «1,5» → 1.5; пусто → undefined */
export function parseNum(s: string | number | undefined | null): number | undefined {
  if (s === undefined || s === null || s === '') return undefined;
  if (typeof s === 'number') return Number.isFinite(s) ? s : undefined;
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

export const fmtNum = (n: number | undefined, digits = 1) =>
  n === undefined ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(n);

/* ---------- Прочее ---------- */

export const SWATCHES = [
  '#7c5cff', '#3b82f6', '#06b6d4', '#14b8a6', '#22c55e', '#84cc16',
  '#eab308', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#a855f7',
  '#64748b', '#0f172a',
];

export function download(filename: string, content: string, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function sum<T>(arr: T[], fn: (x: T) => number): number {
  let s = 0;
  for (const x of arr) s += fn(x) || 0;
  return s;
}

export function groupBy<T>(arr: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of arr) {
    const k = key(x);
    const list = m.get(k);
    if (list) list.push(x);
    else m.set(k, [x]);
  }
  return m;
}

export function vibrate(ms: number | number[] = 15) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}

export function norm(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').trim();
}
