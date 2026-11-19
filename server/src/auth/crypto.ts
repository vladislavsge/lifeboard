// Случайные токены, хэши и шифрование секретов.
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../env.js';

/** Непрозрачный токен для cookie, ссылок в письмах и инвайтов. */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

/** Хэш для поиска по базе: токены хранятся только в таком виде. */
export const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

const key = Buffer.from(env.ENCRYPTION_KEY, 'hex');

/** AES-256-GCM: iv.шифртекст.тег, всё в base64url. */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), enc.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
}

export function decrypt(packed: string): string {
  const [iv, data, tag] = packed.split('.');
  if (!iv || !data || !tag) throw new Error('Повреждённые зашифрованные данные');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

/** Сравнение без утечки времени (для кодов и хэшей). */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/** Читаемый инвайт-код: 3 группы по 4 символа без похожих букв. */
export function inviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = () =>
    Array.from(randomBytes(4))
      .map((b) => alphabet[b % alphabet.length])
      .join('');
  return [pick(), pick(), pick()].join('-');
}
