// Второй фактор по TOTP (Google Authenticator, 1Password и т. п.).
// Секрет хранится в базе зашифрованным; проверка — с окном ±1 шаг (30 сек),
// использованный шаг запоминается, чтобы один код нельзя было ввести дважды.
import { Secret, TOTP } from 'otpauth';

// Латиница: некоторые приложения-аутентификаторы плохо показывают кириллицу
const ISSUER = 'Lifeboard';
const PERIOD = 30;

export const newTotpSecret = (): string => new Secret({ size: 20 }).base32;

function totp(secretBase32: string, email: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: PERIOD,
    secret: Secret.fromBase32(secretBase32),
  });
}

/** Строка otpauth:// для QR-кода. */
export const otpauthUrl = (secret: string, email: string): string => totp(secret, email).toString();

/**
 * Проверяет код. Возвращает номер временного шага (его нужно сохранить
 * в lastStep) или null, если код не подошёл.
 */
export function checkTotp(secret: string, email: string, code: string): number | null {
  const clean = code.replace(/\D/g, '');
  if (clean.length !== 6) return null;
  const delta = totp(secret, email).validate({ token: clean, window: 1 });
  if (delta === null) return null;
  return Math.floor(Date.now() / 1000 / PERIOD) + delta;
}
