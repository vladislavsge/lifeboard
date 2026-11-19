// Журнал событий безопасности. Ошибка записи не должна ломать сам запрос.
import type { Prisma } from '@prisma/client';
import { prisma } from './db.js';

export type AuditEvent =
  | 'register'
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'logout_all'
  | 'session_revoked'
  | 'password_changed'
  | 'password_reset'
  | 'password_reset_requested'
  | 'email_verified'
  | 'totp_enabled'
  | 'totp_disabled'
  | 'totp_failed'
  | 'recovery_code_used'
  | 'passkey_added'
  | 'passkey_removed'
  | 'passkey_login'
  | 'invite_created'
  | 'invite_used'
  | 'push_subscribed'
  | 'push_unsubscribed'
  | 'sync_conflict'
  | 'sync_overwrite';

export async function audit(
  event: AuditEvent,
  p: { userId?: string | null; ip?: string; userAgent?: string; meta?: Prisma.InputJsonValue },
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        event,
        userId: p.userId ?? null,
        ip: p.ip?.slice(0, 45) || null,
        userAgent: p.userAgent?.slice(0, 400) || null,
        ...(p.meta === undefined ? {} : { meta: p.meta }),
      },
    });
  } catch (e) {
    console.error('[audit] не удалось записать событие', event, e);
  }
}
