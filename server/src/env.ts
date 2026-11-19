// Разбор и проверка переменных окружения.
// Ошибки конфигурации должны валить процесс на старте, а не всплывать в рантайме.

const problems: string[] = [];

function str(name: string, fallback?: string): string {
  const v = process.env[name]?.trim();
  if (v) return v;
  if (fallback !== undefined) return fallback;
  problems.push(`${name} не задана`);
  return '';
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (!v) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  problems.push(`${name}: ожидается true или false, получено "${v}"`);
  return fallback;
}

function int(name: string, fallback: number): number {
  const v = process.env[name]?.trim();
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) {
    problems.push(`${name}: ожидается положительное число, получено "${v}"`);
    return fallback;
  }
  return n;
}

const NODE_ENV = (() => {
  const v = process.env.NODE_ENV?.trim() || 'development';
  if (v === 'development' || v === 'production' || v === 'test') return v;
  problems.push(`NODE_ENV: ожидается development | production | test, получено "${v}"`);
  return 'development' as const;
})();

// APP_ORIGIN может перечислять несколько адресов через запятую — это нужно,
// чтобы открыть приложение с телефона по адресу вида http://192.168.1.50:5173,
// не ломая строгую проверку. Первый адрес считается основным: он идёт
// в ссылки писем и в проверку ключей устройств.
const APP_ORIGINS = str('APP_ORIGIN', 'http://localhost:5173')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

for (const origin of APP_ORIGINS) {
  try {
    const u = new URL(origin);
    if (u.origin !== origin) problems.push(`APP_ORIGIN: нужен origin без пути, например ${u.origin}`);
  } catch {
    problems.push(`APP_ORIGIN: не похоже на адрес — "${origin}"`);
  }
}
const APP_ORIGIN = APP_ORIGINS[0] ?? 'http://localhost:5173';

const ENCRYPTION_KEY = str('ENCRYPTION_KEY');
if (ENCRYPTION_KEY && !/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY)) {
  problems.push('ENCRYPTION_KEY: нужно ровно 64 hex-символа (openssl rand -hex 32)');
}

// Ключи VAPID для push-уведомлений. Если их нет — уведомления просто выключены.
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY?.trim() ?? '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY?.trim() ?? '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT?.trim() ?? '';

if (VAPID_PUBLIC_KEY || VAPID_PRIVATE_KEY || VAPID_SUBJECT) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    problems.push('VAPID: нужны оба ключа. Получить: npm run cli -- vapid');
  }
  // Apple отвечает 403 BadJwtToken, если subject не mailto: / https:
  // либо содержит пробелы или угловые скобки
  if (!/^(mailto:[^\s<>]+@[^\s<>]+|https:\/\/[^\s<>]+)$/.test(VAPID_SUBJECT)) {
    problems.push('VAPID_SUBJECT: нужен mailto:you@example.com или https://… без пробелов и угловых скобок');
  }
}

const LOG_LEVEL = (() => {
  const v = process.env.LOG_LEVEL?.trim() || 'info';
  const ok = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];
  if (ok.includes(v)) return v;
  problems.push(`LOG_LEVEL: ожидается один из ${ok.join(' | ')}`);
  return 'info';
})();

if (problems.length) {
  console.error('Не могу стартовать — проверьте .env:');
  for (const p of problems) console.error('  • ' + p);
  process.exit(1);
}

const secureCookies = NODE_ENV === 'production' || APP_ORIGIN.startsWith('https://');

export const env = {
  NODE_ENV,
  DATABASE_URL: str('DATABASE_URL'),
  API_PORT: int('API_PORT', 4000),
  APP_ORIGIN,
  APP_ORIGINS,
  APP_DOMAIN: str('APP_DOMAIN', 'localhost'),
  ENCRYPTION_KEY,
  AUTH_OPEN_REGISTRATION: bool('AUTH_OPEN_REGISTRATION', false),
  TRUST_PROXY: bool('TRUST_PROXY', true),
  LOG_LEVEL,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_SUBJECT,
  pushEnabled: !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT),
  SMTP_URL: process.env.SMTP_URL?.trim() || '',
  MAIL_FROM: process.env.MAIL_FROM?.trim() || 'Трекер <no-reply@localhost>',
  secureCookies,
  // префикс __Host- требует Secure, по http браузер такую cookie отбросит
  sessionCookie: secureCookies ? '__Host-sid' : 'sid',
} as const;

export const isProd = env.NODE_ENV === 'production';
