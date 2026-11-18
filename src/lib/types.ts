// Все сущности приложения. Деньги хранятся в центах (целые числа),
// даты — локальной строкой "YYYY-MM-DDTHH:mm" (без часового пояса).

export type ID = string;

/* ---------- Финансы ---------- */

export type TxType = 'expense' | 'income';
export type SourceModule = 'smoking' | 'groceries' | 'health' | 'tracker' | 'recurring';

export interface Account {
  id: ID;
  name: string;
  kind: 'cash' | 'card' | 'other';
  bank?: string;
  last4?: string;
  cardType?: 'debit' | 'credit';
  color: string;
  archived?: boolean;
}

export interface Category {
  id: ID;
  name: string;
  icon: string;
  type: TxType;
  /** служебная категория, к которой привязываются записи из других модулей */
  system?: 'smoking' | 'groceries' | 'health';
  archived?: boolean;
}

export interface Transaction {
  id: ID;
  type: TxType;
  amount: number; // центы
  categoryId: ID;
  accountId: ID;
  date: string;
  note?: string;
  source?: { module: SourceModule; refId?: ID };
}

/** Бюджет на месяц: по категории или на все расходы (categoryId пустой) */
export interface Budget {
  id: ID;
  categoryId?: ID;
  amount: number; // центы
}

export type Freq = 'weekly' | 'monthly' | 'yearly';

/** Регулярный платёж или доход: подписка, аренда, зарплата */
export interface Recurring {
  id: ID;
  name: string;
  type: TxType;
  amount: number; // центы
  categoryId: ID;
  accountId: ID;
  freq: Freq;
  nextDate: string; // "YYYY-MM-DD"
  /** «якорное» число месяца, чтобы 31-е не съезжало после февраля */
  day?: number;
  /** создавать операцию автоматически в день платежа */
  auto: boolean;
  active: boolean;
}

/* ---------- Тренировки ---------- */

/** strength — подходы × повторы × вес; reps — только повторы; time — время (сек); cardio — время + дистанция */
export type ExKind = 'strength' | 'reps' | 'time' | 'cardio';

export interface Exercise {
  id: ID;
  name: string;
  group: string;
  equipment: string;
  kind: ExKind;
  custom?: boolean;
}

export interface WSet {
  reps?: number;
  weight?: number; // кг
  duration?: number; // секунды
  distance?: number; // км
  done?: boolean;
}

export interface WExercise {
  uid: ID;
  exerciseId: ID;
  sets: WSet[];
  note?: string;
}

export interface Workout {
  id: ID;
  title: string;
  type: string;
  date: string;
  startedAt?: number; // ms, для идущей тренировки
  duration?: number; // минуты
  status: 'active' | 'done';
  programId?: ID;
  dayId?: ID;
  exercises: WExercise[];
  note?: string;
  rating?: number; // 1..5 самочувствие
  calories?: number;
  /** запись «задним числом», которую ещё не трогали — удаляется, если выйти без изменений */
  draft?: boolean;
}

export interface ProgramExercise {
  uid: ID;
  exerciseId: ID;
  sets: number;
  reps?: number;
  weight?: number;
  duration?: number; // секунды
  distance?: number;
  note?: string;
}

export interface ProgramDay {
  id: ID;
  name: string;
  weekdays: number[]; // 1 = Пн … 7 = Вс
  time?: string; // "HH:mm"
  exercises: ProgramExercise[];
}

export interface Program {
  id: ID;
  name: string;
  note?: string;
  active: boolean;
  days: ProgramDay[];
}

/* ---------- Курение ---------- */

export interface SmokeProduct {
  id: ID;
  name: string;
  type: string;
  packPrice?: number; // центы
  unitsPerPack?: number;
  archived?: boolean;
}

export interface Smoke {
  id: ID;
  date: string;
  productId?: ID;
  count: number;
  note?: string;
}

/* ---------- Покупки для дома ---------- */

export interface GroceryItem {
  id: ID;
  name: string;
  category: string;
  unit: string;
  price?: number; // центы, последняя/обычная цена за единицу
  inList: boolean; // нужно купить
  qty?: number;
  checked?: boolean; // уже в корзине
  note?: string;
}

export interface TripLine {
  itemId?: ID;
  name: string;
  qty: number;
  price: number; // центы, сумма по строке
}

export interface GroceryTrip {
  id: ID;
  date: string;
  store?: string;
  lines: TripLine[];
  total: number; // центы
  accountId: ID;
  txId?: ID;
  note?: string;
}

/* ---------- Врачи ---------- */

export interface Doctor {
  id: ID;
  name: string;
  specialty: string;
  clinic?: string;
  phone?: string;
  address?: string;
  note?: string;
}

export interface Appointment {
  id: ID;
  date: string;
  specialty: string;
  doctorId?: ID;
  doctorName?: string;
  clinic?: string;
  address?: string;
  phone?: string;
  reason?: string;
  status: 'planned' | 'done' | 'cancelled';
  cost?: number; // центы
  accountId?: ID;
  txId?: ID;
  result?: string;
}

/* ---------- Свои трекеры ---------- */

export type FieldType = 'number' | 'money' | 'text' | 'select' | 'checkbox' | 'rating' | 'duration';

export interface TrackerField {
  id: ID;
  label: string;
  type: FieldType;
  unit?: string;
  options?: string[];
}

export interface Tracker {
  id: ID;
  name: string;
  icon: string;
  color: string;
  fields: TrackerField[];
  /** если есть поле «деньги» — расход создаётся в этой категории финансов */
  categoryId?: ID;
  createdAt: string;
  /** дневная цель по главному числовому полю (или по числу записей) */
  goal?: number;
  goalMode?: 'min' | 'max';
}

export type EntryValue = string | number | boolean | undefined;

export interface Entry {
  id: ID;
  trackerId: ID;
  date: string;
  values: Record<string, EntryValue>;
  note?: string;
  txId?: ID;
  accountId?: ID;
}

/* ---------- Настройки ---------- */

export type Theme = 'auto' | 'light' | 'dark';

export interface ModuleSetting {
  id: string; // 'finance' | 'workouts' | … | 'tracker:<id>'
  enabled: boolean;
}

export interface Settings {
  version: number;
  currency: string;
  theme: Theme;
  modules: ModuleSetting[];
  restSec: number;
  smokeLimit?: number;
  defaultAccountId?: ID;
  lastSmokeProductId?: ID;
  lastBackupAt?: string;
  onboarded?: boolean;
}
