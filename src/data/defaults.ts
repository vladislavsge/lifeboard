// Стартовые справочники. Пользователь может их менять в приложении.
import type { Account, Category, FieldType } from '../lib/types';

export const DEFAULT_ACCOUNTS: Account[] = [{ id: 'cash', name: 'Наличные', kind: 'cash', color: '#22c55e' }];

export const DEFAULT_CATEGORIES: Category[] = [
  // расходы
  { id: 'c-groceries', name: 'Продукты', icon: '🛒', type: 'expense', system: 'groceries' },
  { id: 'c-food', name: 'Кафе и еда', icon: '🍔', type: 'expense' },
  { id: 'c-transport', name: 'Транспорт', icon: '🚌', type: 'expense' },
  { id: 'c-fuel', name: 'Топливо', icon: '⛽', type: 'expense' },
  { id: 'c-tickets', name: 'Билеты', icon: '🎫', type: 'expense' },
  { id: 'c-taxi', name: 'Такси', icon: '🚕', type: 'expense' },
  { id: 'c-car', name: 'Авто', icon: '🚗', type: 'expense' },
  { id: 'c-home', name: 'Жильё', icon: '🏠', type: 'expense' },
  { id: 'c-utilities', name: 'Коммуналка', icon: '💡', type: 'expense' },
  { id: 'c-phone', name: 'Связь', icon: '📱', type: 'expense' },
  { id: 'c-health', name: 'Здоровье', icon: '💊', type: 'expense', system: 'health' },
  { id: 'c-smoking', name: 'Курение', icon: '🚬', type: 'expense', system: 'smoking' },
  { id: 'c-sport', name: 'Спорт', icon: '🏋️', type: 'expense' },
  { id: 'c-clothes', name: 'Одежда', icon: '👕', type: 'expense' },
  { id: 'c-fun', name: 'Развлечения', icon: '🎮', type: 'expense' },
  { id: 'c-subs', name: 'Подписки', icon: '🔁', type: 'expense' },
  { id: 'c-gifts', name: 'Подарки', icon: '🎁', type: 'expense' },
  { id: 'c-travel', name: 'Путешествия', icon: '✈️', type: 'expense' },
  { id: 'c-other', name: 'Другое', icon: '📦', type: 'expense' },
  // доходы
  { id: 'i-salary', name: 'Зарплата', icon: '💼', type: 'income' },
  { id: 'i-side', name: 'Подработка', icon: '🧰', type: 'income' },
  { id: 'i-gift', name: 'Подарок', icon: '🎁', type: 'income' },
  { id: 'i-refund', name: 'Возврат', icon: '↩️', type: 'income' },
  { id: 'i-cashback', name: 'Кэшбэк', icon: '💳', type: 'income' },
  { id: 'i-other', name: 'Другое', icon: '💰', type: 'income' },
];

export const CURRENCIES = [
  { code: 'EUR', name: 'Евро €' },
  { code: 'USD', name: 'Доллар $' },
  { code: 'GBP', name: 'Фунт £' },
  { code: 'PLN', name: 'Злотый zł' },
  { code: 'CHF', name: 'Франк CHF' },
  { code: 'SEK', name: 'Крона SEK' },
  { code: 'UAH', name: 'Гривна ₴' },
  { code: 'RUB', name: 'Рубль ₽' },
  { code: 'KZT', name: 'Тенге ₸' },
];

/* ---------- Курение ---------- */

export const SMOKE_TYPES: { id: string; name: string; icon: string }[] = [
  { id: 'cigarettes', name: 'Сигареты', icon: '🚬' },
  { id: 'heated', name: 'Стики (IQOS, glo)', icon: '🔥' },
  { id: 'vape', name: 'Вейп / под', icon: '💨' },
  { id: 'hookah', name: 'Кальян', icon: '🫧' },
  { id: 'cigar', name: 'Сигара / сигарилла', icon: '🟤' },
  { id: 'rolling', name: 'Самокрутки', icon: '🌿' },
  { id: 'other', name: 'Другое', icon: '✨' },
];

export const smokeTypeIcon = (t?: string) => SMOKE_TYPES.find((x) => x.id === t)?.icon ?? '🚬';

/* ---------- Покупки ---------- */

export const GROCERY_CATEGORIES: { id: string; name: string; icon: string }[] = [
  { id: 'veg', name: 'Овощи и фрукты', icon: '🥦' },
  { id: 'meat', name: 'Мясо и рыба', icon: '🥩' },
  { id: 'dairy', name: 'Молочное и яйца', icon: '🥛' },
  { id: 'bread', name: 'Хлеб и выпечка', icon: '🍞' },
  { id: 'grain', name: 'Крупы и макароны', icon: '🍝' },
  { id: 'pantry', name: 'Бакалея и консервы', icon: '🥫' },
  { id: 'frozen', name: 'Заморозка', icon: '🧊' },
  { id: 'sweets', name: 'Сладкое и снеки', icon: '🍫' },
  { id: 'drinks', name: 'Напитки', icon: '🧃' },
  { id: 'chem', name: 'Бытовая химия', icon: '🧴' },
  { id: 'hygiene', name: 'Гигиена', icon: '🧻' },
  { id: 'house', name: 'Для дома', icon: '🏠' },
  { id: 'pets', name: 'Животным', icon: '🐾' },
  { id: 'other', name: 'Другое', icon: '📦' },
];

export const groceryCat = (id: string) =>
  GROCERY_CATEGORIES.find((c) => c.id === id) ?? GROCERY_CATEGORIES[GROCERY_CATEGORIES.length - 1];

export const UNITS = ['шт', 'кг', 'г', 'л', 'уп', 'пачка', 'бут'];

/** базовый набор продуктов: [название, категория, единица] */
export const STARTER_GROCERIES: [string, string, string][] = [
  ['Картофель', 'veg', 'кг'], ['Лук', 'veg', 'кг'], ['Морковь', 'veg', 'кг'], ['Помидоры', 'veg', 'кг'],
  ['Огурцы', 'veg', 'кг'], ['Яблоки', 'veg', 'кг'], ['Бананы', 'veg', 'кг'], ['Лимоны', 'veg', 'шт'], ['Зелень', 'veg', 'уп'],
  ['Куриное филе', 'meat', 'кг'], ['Фарш', 'meat', 'кг'], ['Рыба', 'meat', 'кг'], ['Колбаса', 'meat', 'уп'],
  ['Молоко', 'dairy', 'л'], ['Яйца', 'dairy', 'уп'], ['Сыр', 'dairy', 'уп'], ['Творог', 'dairy', 'уп'],
  ['Йогурт', 'dairy', 'шт'], ['Сметана', 'dairy', 'шт'], ['Сливочное масло', 'dairy', 'шт'],
  ['Хлеб', 'bread', 'шт'],
  ['Рис', 'grain', 'уп'], ['Гречка', 'grain', 'уп'], ['Макароны', 'grain', 'уп'], ['Овсянка', 'grain', 'уп'],
  ['Сахар', 'pantry', 'уп'], ['Соль', 'pantry', 'уп'], ['Растительное масло', 'pantry', 'бут'],
  ['Кофе', 'pantry', 'уп'], ['Чай', 'pantry', 'уп'], ['Консервы', 'pantry', 'шт'],
  ['Вода', 'drinks', 'бут'], ['Сок', 'drinks', 'л'],
  ['Средство для посуды', 'chem', 'шт'], ['Стиральный порошок', 'chem', 'уп'], ['Губки', 'chem', 'уп'], ['Мусорные пакеты', 'chem', 'уп'],
  ['Туалетная бумага', 'hygiene', 'уп'], ['Зубная паста', 'hygiene', 'шт'], ['Шампунь', 'hygiene', 'шт'], ['Мыло', 'hygiene', 'шт'],
  ['Бумажные полотенца', 'hygiene', 'уп'],
];

/* ---------- Врачи ---------- */

export const SPECIALTIES = [
  'Терапевт / семейный врач', 'Стоматолог', 'Окулист', 'ЛОР', 'Дерматолог', 'Кардиолог', 'Невролог',
  'Гастроэнтеролог', 'Эндокринолог', 'Уролог', 'Гинеколог', 'Ортопед / травматолог', 'Хирург',
  'Психотерапевт / психолог', 'Аллерголог', 'Физиотерапевт', 'Массаж', 'Анализы', 'УЗИ / диагностика',
  'Вакцинация', 'Другое',
];

/* ---------- Свои трекеры ---------- */

export const FIELD_TYPES: { id: FieldType; name: string; hint: string }[] = [
  { id: 'number', name: 'Число', hint: '72,5 кг, 8 стаканов' },
  { id: 'money', name: 'Деньги', hint: 'попадёт в расходы' },
  { id: 'text', name: 'Текст', hint: 'заметка, название' },
  { id: 'select', name: 'Выбор из списка', hint: 'свои варианты' },
  { id: 'checkbox', name: 'Да / нет', hint: 'галочка' },
  { id: 'rating', name: 'Оценка 1–5', hint: 'настроение, качество' },
  { id: 'duration', name: 'Длительность', hint: 'в минутах' },
];

export interface TrackerPreset {
  /** раздел в списке заготовок */
  group: string;
  name: string;
  icon: string;
  color: string;
  fields: { label: string; type: FieldType; unit?: string; options?: string[] }[];
  goal?: number;
  goalMode?: 'min' | 'max';
}

// Цель считается по первому полю «число / деньги / длительность», а если таких
// полей нет — по количеству записей за день. Длительность задаётся в минутах.
export const TRACKER_PRESETS: TrackerPreset[] = [
  /* ---------- Здоровье ---------- */
  { group: 'Здоровье', name: 'Вес', icon: '⚖️', color: '#06b6d4', fields: [{ label: 'Вес', type: 'number', unit: 'кг' }] },
  {
    group: 'Здоровье', name: 'Замеры тела', icon: '📏', color: '#14b8a6',
    fields: [
      { label: 'Вес', type: 'number', unit: 'кг' },
      { label: 'Талия', type: 'number', unit: 'см' },
      { label: 'Грудь', type: 'number', unit: 'см' },
      { label: 'Бёдра', type: 'number', unit: 'см' },
      { label: 'Бицепс', type: 'number', unit: 'см' },
    ],
  },
  {
    group: 'Здоровье', name: 'Давление', icon: '🩺', color: '#ef4444',
    fields: [
      { label: 'Верхнее', type: 'number', unit: 'мм рт. ст.' },
      { label: 'Нижнее', type: 'number', unit: 'мм рт. ст.' },
      { label: 'Пульс', type: 'number', unit: 'уд/мин' },
    ],
  },
  {
    group: 'Здоровье', name: 'Сахар в крови', icon: '🩸', color: '#be123c',
    fields: [
      { label: 'Глюкоза', type: 'number', unit: 'ммоль/л' },
      { label: 'Когда', type: 'select', options: ['Натощак', 'После еды', 'Перед сном'] },
    ],
  },
  {
    group: 'Здоровье', name: 'Сон', icon: '😴', color: '#6366f1',
    fields: [{ label: 'Длительность', type: 'duration' }, { label: 'Качество', type: 'rating' }],
    goal: 420,
    goalMode: 'min',
  },
  {
    group: 'Здоровье', name: 'Лекарства', icon: '💊', color: '#f43f5e',
    fields: [{ label: 'Препарат', type: 'text' }, { label: 'Доза', type: 'text' }],
    goal: 1,
    goalMode: 'min',
  },
  {
    group: 'Здоровье', name: 'Головная боль', icon: '🤕', color: '#a855f7',
    fields: [
      { label: 'Сила', type: 'rating' },
      { label: 'Где', type: 'select', options: ['Виски', 'Затылок', 'Лоб', 'Вся голова'] },
      { label: 'Выпил таблетку', type: 'checkbox' },
    ],
  },
  {
    group: 'Здоровье', name: 'Настроение', icon: '🙂', color: '#eab308',
    fields: [{ label: 'Настроение', type: 'rating' }, { label: 'Что повлияло', type: 'text' }],
  },

  /* ---------- Привычки ---------- */
  {
    group: 'Привычки', name: 'Привычка', icon: '✅', color: '#10b981',
    fields: [{ label: 'Сделано', type: 'checkbox' }, { label: 'Заметка', type: 'text' }],
    goal: 1,
    goalMode: 'min',
  },
  {
    group: 'Привычки', name: 'Вода', icon: '💧', color: '#3b82f6',
    fields: [{ label: 'Объём', type: 'number', unit: 'мл' }],
    goal: 2000,
    goalMode: 'min',
  },
  {
    group: 'Привычки', name: 'Шаги', icon: '👣', color: '#22c55e',
    fields: [{ label: 'Шаги', type: 'number', unit: 'шагов' }],
    goal: 8000,
    goalMode: 'min',
  },
  {
    group: 'Привычки', name: 'Медитация', icon: '🧘', color: '#8b5cf6',
    fields: [{ label: 'Длительность', type: 'duration' }],
    goal: 10,
    goalMode: 'min',
  },
  {
    group: 'Привычки', name: 'Экранное время', icon: '📱', color: '#475569',
    fields: [{ label: 'Время', type: 'duration' }],
    goal: 120,
    goalMode: 'max',
  },
  {
    group: 'Привычки', name: 'Кофе', icon: '☕', color: '#a16207',
    fields: [{ label: 'Порций', type: 'number', unit: 'шт' }, { label: 'Цена', type: 'money' }],
    goal: 3,
    goalMode: 'max',
  },
  {
    group: 'Привычки', name: 'Алкоголь', icon: '🍺', color: '#f59e0b',
    fields: [
      { label: 'Напиток', type: 'select', options: ['Пиво', 'Вино', 'Крепкое', 'Коктейль'] },
      { label: 'Порций', type: 'number', unit: 'шт' },
      { label: 'Цена', type: 'money' },
    ],
    goal: 2,
    goalMode: 'max',
  },

  /* ---------- Занятия ---------- */
  {
    group: 'Занятия', name: 'Чтение', icon: '📚', color: '#0d9488',
    fields: [
      { label: 'Книга', type: 'text' },
      { label: 'Время', type: 'duration' },
      { label: 'Страниц', type: 'number', unit: 'стр' },
    ],
    goal: 30,
    goalMode: 'min',
  },
  {
    group: 'Занятия', name: 'Учёба', icon: '🎓', color: '#0ea5e9',
    fields: [{ label: 'Предмет', type: 'text' }, { label: 'Время', type: 'duration' }],
    goal: 30,
    goalMode: 'min',
  },
  {
    group: 'Занятия', name: 'Уборка', icon: '🧹', color: '#84cc16',
    fields: [
      { label: 'Что', type: 'select', options: ['Пылесос', 'Стирка', 'Посуда', 'Ванная', 'Окна', 'Другое'] },
      { label: 'Время', type: 'duration' },
    ],
  },
  {
    group: 'Занятия', name: 'Авто', icon: '🚗', color: '#64748b',
    fields: [
      { label: 'Что', type: 'select', options: ['Заправка', 'Мойка', 'Сервис', 'Парковка', 'Другое'] },
      { label: 'Пробег', type: 'number', unit: 'км' },
      { label: 'Литры', type: 'number', unit: 'л' },
      { label: 'Сумма', type: 'money' },
    ],
  },

  /* ---------- Своё ---------- */
  {
    group: 'Своё', name: 'Свой трекер', icon: '✨', color: '#7c5cff',
    fields: [{ label: 'Значение', type: 'number' }],
  },
];

/** Заготовки по разделам — в том же порядке, что в списке выше. */
export const TRACKER_PRESET_GROUPS: { name: string; items: TrackerPreset[] }[] = TRACKER_PRESETS.reduce<
  { name: string; items: TrackerPreset[] }[]
>((groups, preset) => {
  const last = groups[groups.length - 1];
  if (last && last.name === preset.group) last.items.push(preset);
  else groups.push({ name: preset.group, items: [preset] });
  return groups;
}, []);

export const EMOJI_SUGGEST = [
  '✨', '⭐', '🔥', '✅', '💧', '⚖️', '📏', '😴', '🙂', '🩺', '🩸', '💊', '🤕', '☕', '🍺', '📚',
  '🎓', '🚗', '🐶', '🌱', '🧘', '🎸', '🎮', '💻', '📱', '🧹', '🧺', '💅', '💇', '🎯', '📈', '🍎',
  '🥗', '🚴', '🏃', '🛁', '🪥', '📞', '❤️', '👣',
];
