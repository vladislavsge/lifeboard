// Инвайт-коды. В базе лежит только sha256 кода — по дампу базы
// восстановить действующий код нельзя.
import { prisma } from '../db.js';
import { inviteCode, sha256 } from './crypto.js';

/** Приводит введённый код к каноническому виду: ABCD-EFGH-JKLM */
export function normalizeCode(raw: string): string {
  const clean = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.replace(/(.{4})(?=.)/g, '$1-');
}

export async function createInvite(p: {
  createdById?: string | null;
  maxUses?: number;
  days?: number | null;
  note?: string | null;
}): Promise<string> {
  const code = inviteCode();
  await prisma.invite.create({
    data: {
      codeHash: sha256(code),
      createdById: p.createdById ?? null,
      maxUses: p.maxUses && p.maxUses > 0 ? p.maxUses : 1,
      note: p.note ?? null,
      expiresAt: p.days ? new Date(Date.now() + p.days * 24 * 60 * 60 * 1000) : null,
    },
  });
  return code;
}

/**
 * Атомарно занимает одно использование кода.
 * Один UPDATE с проверкой условий — два параллельных запроса не смогут
 * потратить последнее использование дважды.
 */
export async function consumeInvite(raw: string): Promise<string | null> {
  const hash = sha256(normalizeCode(raw));
  const affected = await prisma.$executeRaw`
    UPDATE Invite
       SET usedCount = usedCount + 1
     WHERE codeHash = ${hash}
       AND revokedAt IS NULL
       AND (expiresAt IS NULL OR expiresAt > NOW(3))
       AND usedCount < maxUses`;
  if (affected !== 1) return null;
  const invite = await prisma.invite.findUnique({ where: { codeHash: hash }, select: { id: true } });
  return invite?.id ?? null;
}

/** Откат использования, если регистрация в итоге не состоялась. */
export async function releaseInvite(id: string): Promise<void> {
  await prisma.invite.updateMany({ where: { id, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
}
