// Общие настройки окружения для тестов: отдельная база, предсказуемые ключи.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Читает значения из корневого .env, чтобы не дублировать пароли в тестах. */
function rootEnv(): Record<string, string> {
  try {
    const text = readFileSync(join(process.cwd(), '..', '.env'), 'utf8');
    const out: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
      const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (m?.[1]) out[m[1]] = (m[2] ?? '').replace(/^"(.*)"$/, '$1');
    }
    return out;
  } catch {
    return {};
  }
}

const root = rootEnv();
const port = root.MYSQL_PORT ?? '3306';
const password = root.MYSQL_ROOT_PASSWORD ?? 'root';

export const TEST_DB = 'lifeboard_test';
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? `mysql://root:${password}@127.0.0.1:${port}/${TEST_DB}`;
export const ADMIN_DATABASE_URL = TEST_DATABASE_URL.replace(/\/[^/]+$/, '/mysql');

export const TEST_ORIGIN = 'http://localhost:5173';
/** Второй разрешённый адрес — как при проверке с телефона в домашней сети */
export const TEST_ORIGIN_ALT = 'http://192.168.0.50:5173';

export function applyTestEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.APP_ORIGIN = `${TEST_ORIGIN},${TEST_ORIGIN_ALT}`;
  process.env.APP_DOMAIN = 'localhost';
  process.env.ENCRYPTION_KEY = '0'.repeat(63) + '1';
  process.env.AUTH_OPEN_REGISTRATION = 'false';
  process.env.LOG_LEVEL = 'silent';
  process.env.SMTP_URL = '';
  // отдельная пара ключей для тестов; настоящая отправка подменяется заглушкой
  process.env.VAPID_PUBLIC_KEY =
    'BMtznqMZE0jFsDjHcK0Q7AEaFVFaziO44xj7YxVsPc0f4P15m1Z2qq1vr6Enwq9qe0ru428vEqBodpxsmlnFGdQ';
  process.env.VAPID_PRIVATE_KEY = '8uEiXr-rq1SuavlE5ZjGXQTRHTAn_fRv7IcrR1GN45U';
  process.env.VAPID_SUBJECT = 'mailto:test@example.com';
}
