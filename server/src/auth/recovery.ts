// Коды восстановления: запасной вход, если телефон с аутентификатором потерян.
// Показываются один раз, в базе — только argon2-хэши.
import { randomBytes } from 'node:crypto';
import { prisma } from '../db.js';
import { hashSecret, verifySecret } from './password.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const COUNT = 10;

/** Код вида ABCDE-FGHJK: 10 символов, ~50 бит случайности. */
function newCode(): string {
  const chars = Array.from(randomBytes(10)).map((b) => ALPHABET[b % ALPHABET.length]);
  return chars.slice(0, 5).join('') + '-' + chars.slice(5).join('');
}

export const normalizeCode = (raw: string): string => {
  const clean = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.length === 10 ? clean.slice(0, 5) + '-' + clean.slice(5) : clean;
};

/** Выдаёт новый комплект кодов, старые перестают действовать. */
export async function replaceRecoveryCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: COUNT }, newCode);
  // последовательно: argon2 берёт по 19 МиБ на вычисление
  const hashes: string[] = [];
  for (const code of codes) hashes.push(await hashSecret(code));

  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId } }),
    prisma.recoveryCode.createMany({ data: hashes.map((codeHash) => ({ userId, codeHash })) }),
  ]);
  return codes;
}

/** Гасит код, если он подходит. Повторно тот же код не сработает. */
export async function useRecoveryCode(userId: string, raw: string): Promise<boolean> {
  const code = normalizeCode(raw);
  if (code.length !== 11) return false;
  const rows = await prisma.recoveryCode.findMany({
    where: { userId, usedAt: null },
    select: { id: true, codeHash: true },
  });
  for (const row of rows) {
    if (await verifySecret(row.codeHash, code)) {
      // updateMany с проверкой usedAt — два параллельных запроса не погасят код дважды
      const res = await prisma.recoveryCode.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      return res.count === 1;
    }
  }
  return false;
}

export const recoveryCodesLeft = (userId: string): Promise<number> =>
  prisma.recoveryCode.count({ where: { userId, usedAt: null } });
