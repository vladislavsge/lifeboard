// Пароли: argon2id с параметрами из рекомендаций OWASP (19 МиБ, 2 прохода).
import { hash, verify } from '@node-rs/argon2';

const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export const hashSecret = (plain: string): Promise<string> => hash(plain, OPTIONS);

/** Проверка никогда не бросает: испорченный хэш в базе — это просто «не подошло». */
export async function verifySecret(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}

// Короткий список самых частых паролей. Не заменяет менеджер паролей,
// но отсекает очевидное — и, в отличие от проверки по утечкам,
// не отправляет пароль пользователя наружу.
const COMMON = new Set(
  [
    'password', 'password1', 'password123', 'qwerty', 'qwerty123', 'qwertyuiop', '123456', '1234567',
    '12345678', '123456789', '1234567890', '111111', '000000', 'iloveyou', 'admin', 'administrator',
    'welcome', 'welcome1', 'monkey', 'dragon', 'letmein', 'football', 'baseball', 'superman', 'abc123',
    'passw0rd', 'p@ssw0rd', 'zaq12wsx', 'qazwsxedc', 'asdfghjkl', 'parol', 'parolparol', 'ytrewq',
    'йцукен', 'йцукенгш', 'пароль', 'привет', 'sergey', 'andrey'
  ].map((s) => s.toLowerCase()),
);

/** Возвращает текст ошибки или null, если пароль годится. */
export function passwordProblem(plain: string): string | null {
  if (plain.length < 12) return 'Пароль должен быть не короче 12 символов';
  if (plain.length > 200) return 'Пароль не длиннее 200 символов';
  const low = plain.toLowerCase();
  if (COMMON.has(low)) return 'Такой пароль слишком часто встречается — придумайте другой';
  if (/^(.)\1+$/.test(plain)) return 'Пароль из одного повторяющегося символа';
  if (/^\d+$/.test(plain)) return 'Пароль из одних цифр слишком просто подобрать';
  return null;
}
