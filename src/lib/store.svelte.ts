// Единое реактивное хранилище. Все данные живут в памяти ($state) и автоматически
// сохраняются в IndexedDB (по коллекциям, с небольшой задержкой).
import { kvClear, kvGet, kvSet } from './db';
import type {
  Account, Appointment, Budget, Category, Doctor, Entry, Exercise, Freq, GroceryItem, GroceryTrip, Program,
  Recurring, Settings, Smoke, SmokeProduct, SourceModule, Tracker, Transaction, TxType, Workout, WSet,
} from './types';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '../data/defaults';
import { BUILTIN_EXERCISES } from '../data/exercises';
import { clone, dateKey, money, nowLocal, plural, setCurrency, todayKey, uid } from './utils';
import { toast } from './nav.svelte';

export interface Data {
  settings: Settings;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  exercises: Exercise[]; // только свои упражнения (встроенные — в коде)
  workouts: Workout[];
  programs: Program[];
  smokeProducts: SmokeProduct[];
  smokes: Smoke[];
  groceryItems: GroceryItem[];
  groceryTrips: GroceryTrip[];
  doctors: Doctor[];
  appointments: Appointment[];
  trackers: Tracker[];
  entries: Entry[];
  budgets: Budget[];
  recurring: Recurring[];
}

export type ArrKey = Exclude<keyof Data, 'settings'>;
type ItemOf<K extends ArrKey> = Data[K][number];

const ARRAY_KEYS: ArrKey[] = [
  'accounts', 'categories', 'transactions', 'exercises', 'workouts', 'programs', 'smokeProducts',
  'smokes', 'groceryItems', 'groceryTrips', 'doctors', 'appointments', 'trackers', 'entries',
  'budgets', 'recurring',
];
const KEYS: (keyof Data)[] = ['settings', ...ARRAY_KEYS];

export const BUILTIN_MODULE_IDS = ['finance', 'workouts', 'smoking', 'groceries', 'health'];

function defaultSettings(): Settings {
  return {
    version: 1,
    currency: 'EUR',
    theme: 'auto',
    modules: BUILTIN_MODULE_IDS.map((id) => ({ id, enabled: true })),
    restSec: 90,
  };
}

function emptyData(): Data {
  return {
    settings: defaultSettings(),
    accounts: clone(DEFAULT_ACCOUNTS),
    categories: clone(DEFAULT_CATEGORIES),
    transactions: [], exercises: [], workouts: [], programs: [], smokeProducts: [], smokes: [],
    groceryItems: [], groceryTrips: [], doctors: [], appointments: [], trackers: [], entries: [],
    budgets: [], recurring: [],
  };
}

export const data: Data = $state(emptyData());

class AppState {
  ready = $state(false);
  /** «тикающее» время — обновляется раз в 30 сек, чтобы «N мин назад» были свежими */
  now = $state(Date.now());
}
export const app = new AppState();

/* ---------- Загрузка, миграции, сохранение ---------- */

export async function loadData() {
  const loaded = await Promise.all(KEYS.map((k) => kvGet(k)));
  KEYS.forEach((k, i) => {
    if (loaded[i] !== undefined && loaded[i] !== null) (data as unknown as Record<string, unknown>)[k] = loaded[i];
  });
  migrate();
  startPersistence();
  app.ready = true;
  runRecurring();
  let day = todayKey();
  setInterval(() => {
    app.now = Date.now();
    // наступил новый день, пока приложение открыто
    if (todayKey() !== day) {
      day = todayKey();
      runRecurring();
    }
  }, 30_000);
  navigator.storage?.persist?.().catch(() => {});
}

function migrate() {
  data.settings = { ...defaultSettings(), ...data.settings };
  const s = data.settings;
  for (const k of ARRAY_KEYS) if (!Array.isArray(data[k])) (data as unknown as Record<string, unknown>)[k] = [];
  if (!data.accounts.length) data.accounts = clone(DEFAULT_ACCOUNTS);
  if (!data.categories.length) data.categories = clone(DEFAULT_CATEGORIES);

  // модули: встроенные + свои трекеры, без мусора
  const known = new Set([...BUILTIN_MODULE_IDS, ...data.trackers.map((t) => 'tracker:' + t.id)]);
  s.modules = s.modules.filter((m) => known.has(m.id));
  const have = new Set(s.modules.map((m) => m.id));
  for (const id of known) if (!have.has(id)) s.modules.push({ id, enabled: true });
  setCurrency(s.currency);
}

const pending = new Map<string, unknown>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;

function flush() {
  clearTimeout(flushTimer);
  for (const [k, v] of pending) kvSet(k, v);
  pending.clear();
}

function startPersistence() {
  $effect.root(() => {
    for (const k of KEYS) {
      $effect(() => {
        const snap = $state.snapshot(data[k]);
        pending.set(k, snap);
        clearTimeout(flushTimer);
        flushTimer = setTimeout(flush, 300);
      });
    }
  });
  // телефон может «усыпить» вкладку в любой момент — сохраняемся сразу
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  window.addEventListener('pagehide', flush);
}

/* ---------- Общие CRUD ---------- */

export function add<K extends ArrKey>(k: K, item: ItemOf<K>): ItemOf<K> {
  (data[k] as ItemOf<K>[]).push(item);
  return (data[k] as ItemOf<K>[])[data[k].length - 1];
}

export function find<K extends ArrKey>(k: K, id: string | undefined): ItemOf<K> | undefined {
  if (!id) return undefined;
  return (data[k] as ItemOf<K>[]).find((x) => (x as { id: string }).id === id);
}

export function update<K extends ArrKey>(k: K, id: string, patch: Partial<ItemOf<K>>) {
  const it = find(k, id);
  if (it) Object.assign(it as object, patch);
}

/** обновить, если есть, иначе добавить */
export function upsert<K extends ArrKey>(k: K, item: ItemOf<K>): ItemOf<K> {
  const it = find(k, (item as { id: string }).id);
  if (it) {
    Object.assign(it as object, item);
    return it;
  }
  return add(k, item);
}

export function remove<K extends ArrKey>(k: K, id: string | undefined) {
  if (!id) return;
  const arr = data[k] as ItemOf<K>[];
  const i = arr.findIndex((x) => (x as { id: string }).id === id);
  if (i >= 0) arr.splice(i, 1);
}

/* ---------- Справочники ---------- */

const allExercises = $derived([...BUILTIN_EXERCISES, ...data.exercises]);
const exerciseMap = $derived(new Map(allExercises.map((e) => [e.id, e])));

export const exercises = () => allExercises;
export const exercise = (id: string): Exercise =>
  exerciseMap.get(id) ?? { id, name: 'Удалённое упражнение', group: 'Другое', equipment: '', kind: 'strength' };

export const account = (id?: string) => find('accounts', id);
export const category = (id?: string) => find('categories', id);

export function accountLabel(id?: string): string {
  const a = account(id);
  if (!a) return '—';
  return a.last4 ? `${a.name} ·${a.last4}` : a.name;
}

export function activeAccounts(): Account[] {
  return data.accounts.filter((a) => !a.archived);
}

export function defaultAccountId(): string {
  const s = data.settings.defaultAccountId;
  if (s && data.accounts.some((a) => a.id === s && !a.archived)) return s;
  return activeAccounts()[0]?.id ?? data.accounts[0]?.id ?? 'cash';
}

export function categoriesOf(type: TxType): Category[] {
  return data.categories.filter((c) => c.type === type && !c.archived);
}

export function systemCategoryId(system: 'smoking' | 'groceries' | 'health'): string {
  let c = data.categories.find((x) => x.system === system && !x.archived) ?? data.categories.find((x) => x.system === system);
  if (!c) {
    const def = DEFAULT_CATEGORIES.find((x) => x.system === system)!;
    c = add('categories', { ...def, id: def.id + '-' + uid().slice(-4) });
  }
  return c.id;
}

/* ---------- Связанные расходы (из других модулей) ---------- */

export interface LinkedTx {
  amount: number | null | undefined;
  categoryId: string;
  accountId: string;
  date: string;
  note?: string;
  module: SourceModule;
  refId?: string;
  type?: TxType;
}

/** Создаёт/обновляет/удаляет расход, связанный с записью другого модуля. Возвращает id или undefined. */
export function syncLinkedTx(existingId: string | undefined, p: LinkedTx): string | undefined {
  if (!p.amount || p.amount <= 0) {
    if (existingId) remove('transactions', existingId);
    return undefined;
  }
  const fields = {
    type: p.type ?? ('expense' as TxType),
    amount: p.amount,
    categoryId: p.categoryId,
    accountId: p.accountId,
    date: p.date,
    note: p.note,
    source: { module: p.module, refId: p.refId },
  };
  const ex = find('transactions', existingId);
  if (ex) {
    Object.assign(ex, fields);
    return ex.id;
  }
  return add('transactions', { id: uid(), ...fields }).id;
}

/* ---------- Регулярные платежи ---------- */

/** следующая дата по расписанию; day — «якорное» число месяца */
export function advanceDate(d: string, freq: Freq, day?: number): string {
  const [y, m, dd] = d.split('-').map(Number);
  if (freq === 'weekly') return dateKey(new Date(y, m - 1, dd + 7));
  const anchor = day ?? dd;
  const ny = freq === 'yearly' ? y + 1 : y;
  const nm = freq === 'yearly' ? m - 1 : m; // monthly: следующий месяц (m уже 1-based)
  const last = new Date(ny, nm + 1, 0).getDate();
  return dateKey(new Date(ny, nm, Math.min(anchor, last)));
}

function recurringTx(r: Recurring, date: string) {
  add('transactions', {
    id: uid(),
    type: r.type,
    amount: r.amount,
    categoryId: r.categoryId,
    accountId: r.accountId,
    date,
    note: r.name,
    source: { module: 'recurring', refId: r.id },
  });
}

/** Создаёт операции по наступившим автоматическим платежам. Возвращает количество. */
export function processRecurring(): number {
  const today = todayKey();
  let n = 0;
  for (const r of data.recurring) {
    if (!r.active || !r.auto) continue;
    let guard = 0;
    while (r.nextDate <= today && guard++ < 120) {
      recurringTx(r, r.nextDate + 'T09:00');
      r.nextDate = advanceDate(r.nextDate, r.freq, r.day);
      n++;
    }
  }
  return n;
}

function runRecurring() {
  const n = processRecurring();
  if (n) toast(`Добавлено ${n} ${plural(n, 'регулярная операция', 'регулярные операции', 'регулярных операций')}`);
}

/** Ручное подтверждение платежа (для неавтоматических) */
export function payRecurring(r: Recurring) {
  recurringTx(r, nowLocal());
  r.nextDate = advanceDate(r.nextDate, r.freq, r.day);
  toast(`${r.name}: ${money(r.amount)} записано`);
}

/** Удаляет операцию и снимает ссылки на неё из других модулей */
export function removeTransaction(id: string) {
  remove('transactions', id);
  for (const t of data.groceryTrips) if (t.txId === id) t.txId = undefined;
  for (const a of data.appointments) if (a.txId === id) a.txId = undefined;
  for (const e of data.entries) if (e.txId === id) e.txId = undefined;
}

/* ---------- Тренировки ---------- */

/** Последний результат в упражнении (для подсказки и автозаполнения) */
export function lastSets(exerciseId: string, excludeWorkoutId?: string): { date: string; sets: WSet[] } | undefined {
  let best: Workout | undefined;
  for (const w of data.workouts) {
    if (w.id === excludeWorkoutId || w.status !== 'done') continue;
    if (!w.exercises.some((e) => e.exerciseId === exerciseId)) continue;
    if (!best || w.date > best.date) best = w;
  }
  if (!best) return undefined;
  const we = best.exercises.find((e) => e.exerciseId === exerciseId)!;
  return { date: best.date, sets: we.sets };
}

export const activeWorkout = () => data.workouts.find((w) => w.status === 'active');

/* ---------- Модули ---------- */

export interface ModuleInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
  path: string;
  description: string;
  tracker?: Tracker;
}

export const BUILTIN_MODULES: Record<string, Omit<ModuleInfo, 'id'>> = {
  finance: { name: 'Финансы', icon: '💶', color: '#22c55e', path: '/finance', description: 'Доходы, расходы, карты' },
  workouts: { name: 'Тренировки', icon: '🏋️', color: '#f97316', path: '/workouts', description: 'Тренировки и программы' },
  smoking: { name: 'Курение', icon: '🚬', color: '#94a3b8', path: '/smoking', description: 'Сколько и что курил, траты' },
  groceries: { name: 'Покупки', icon: '🛒', color: '#3b82f6', path: '/groceries', description: 'Список продуктов и чеки' },
  health: { name: 'Врачи', icon: '🩺', color: '#ef4444', path: '/health', description: 'Записи к врачам' },
};

export function moduleInfo(id: string): ModuleInfo | undefined {
  if (BUILTIN_MODULES[id]) return { id, ...BUILTIN_MODULES[id] };
  if (id.startsWith('tracker:')) {
    const t = find('trackers', id.slice(8));
    if (t) return { id, name: t.name, icon: t.icon, color: t.color, path: '/t/' + t.id, description: 'Свой трекер', tracker: t };
  }
  return undefined;
}

export const isEnabled = (id: string) => data.settings.modules.some((m) => m.id === id && m.enabled);

export function enabledModules(): ModuleInfo[] {
  return data.settings.modules
    .filter((m) => m.enabled)
    .map((m) => moduleInfo(m.id))
    .filter((m): m is ModuleInfo => !!m);
}

/* ---------- Свои трекеры ---------- */

export function removeTracker(id: string) {
  for (const e of data.entries.filter((x) => x.trackerId === id)) if (e.txId) remove('transactions', e.txId);
  data.entries = data.entries.filter((e) => e.trackerId !== id);
  remove('trackers', id);
  data.settings.modules = data.settings.modules.filter((m) => m.id !== 'tracker:' + id);
}

/* ---------- Экспорт / импорт ---------- */

export function exportJSON(): string {
  return JSON.stringify({ app: 'lifeboard', version: 1, exportedAt: nowLocal(), data: $state.snapshot(data) });
}

export function importJSON(text: string) {
  const parsed = JSON.parse(text);
  const src = parsed?.app === 'lifeboard' ? parsed.data : parsed;
  if (!src || typeof src !== 'object' || !('settings' in src)) throw new Error('Это не файл резервной копии трекера');
  const fresh = emptyData();
  for (const k of KEYS) {
    (data as unknown as Record<string, unknown>)[k] = src[k] ?? (fresh as unknown as Record<string, unknown>)[k];
  }
  migrate();
}

export async function resetAll() {
  await kvClear();
  const fresh = emptyData();
  for (const k of KEYS) (data as unknown as Record<string, unknown>)[k] = (fresh as unknown as Record<string, unknown>)[k];
  migrate();
}
