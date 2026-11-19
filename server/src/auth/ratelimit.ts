// Защита от перебора паролей: считаем неудачные попытки за окно времени.
import { GraphQLError } from 'graphql';
import { prisma } from '../db.js';

const WINDOW_MIN = 15;
const MAX_PER_EMAIL = 5;
const MAX_PER_IP = 20;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ключ по аккаунту: нормализованная почта. */
export const emailKey = (email: string): string => email.trim().toLowerCase().slice(0, 190);

export async function assertCanTry(email: string, ip: string): Promise<void> {
  const since = new Date(Date.now() - WINDOW_MIN * 60_000);
  const key = emailKey(email);
  const [byEmail, byIp] = await Promise.all([
    prisma.loginAttempt.count({ where: { emailKey: key, ok: false, at: { gt: since } } }),
    ip ? prisma.loginAttempt.count({ where: { ip, ok: false, at: { gt: since } } }) : Promise.resolve(0),
  ]);
  if (byEmail >= MAX_PER_EMAIL || byIp >= MAX_PER_IP) {
    throw new GraphQLError('Слишком много попыток входа. Попробуйте через ' + WINDOW_MIN + ' минут', {
      extensions: { code: 'TOO_MANY_ATTEMPTS' },
    });
  }
}

export async function recordAttempt(email: string, ip: string, ok: boolean): Promise<void> {
  const key = emailKey(email);
  await prisma.loginAttempt.create({ data: { emailKey: key, ip: ip.slice(0, 45) || null, ok } });
  if (ok) {
    // удачный вход обнуляет счётчик неудач по этому аккаунту
    await prisma.loginAttempt.deleteMany({ where: { emailKey: key, ok: false } });
  } else {
    // небольшая задержка: перебор дорожает, человек её не замечает
    await sleep(250 + Math.floor(Math.random() * 250));
  }
}
