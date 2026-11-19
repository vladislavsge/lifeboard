// Общие типы GraphQL и помощники доступа.
import { GraphQLError } from 'graphql';
import { builder } from './builder.js';
import { prisma } from '../db.js';
import type { Ctx } from '../context.js';
import type { ActiveSession, SessionUser } from '../auth/session.js';

/** Ошибка с понятным текстом и кодом — такие проходят через маскировку в prod. */
export const fail = (message: string, code: string): GraphQLError =>
  new GraphQLError(message, { extensions: { code } });

/** Пользователь с пройденным вторым фактором. Всё остальное — отказ. */
export function requireUser(ctx: Ctx): SessionUser {
  if (!ctx.user || !ctx.session) throw fail('Нужно войти в аккаунт', 'UNAUTHENTICATED');
  if (!ctx.session.mfaPassedAt) throw fail('Подтвердите вход кодом двухфакторной проверки', 'MFA_REQUIRED');
  return ctx.user;
}

/** Вход начат, но второй фактор мог ещё не пройти — для экрана ввода кода. */
export function requireSession(ctx: Ctx): { user: SessionUser; session: ActiveSession } {
  if (!ctx.user || !ctx.session) throw fail('Нужно войти в аккаунт', 'UNAUTHENTICATED');
  return { user: ctx.user, session: ctx.session };
}

export function requireAdmin(ctx: Ctx): SessionUser {
  const user = requireUser(ctx);
  if (user.role !== 'admin') throw fail('Нужны права администратора', 'FORBIDDEN');
  return user;
}

export interface MeShape {
  id: string;
  email: string;
  role: string;
  emailVerified: boolean;
  totpEnabled: boolean;
  passkeyCount: number;
  /** false — вход начат, но второй фактор ещё не пройден */
  mfaPassed: boolean;
  createdAt: Date;
}

export async function loadMe(user: SessionUser, mfaPassed: boolean): Promise<MeShape> {
  const [totp, passkeyCount] = await Promise.all([
    prisma.totpSecret.findUnique({ where: { userId: user.id }, select: { confirmedAt: true } }),
    prisma.passkey.count({ where: { userId: user.id } }),
  ]);
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
    totpEnabled: totp?.confirmedAt != null,
    passkeyCount,
    mfaPassed,
    createdAt: user.createdAt,
  };
}

export const MeRef = builder.objectRef<MeShape>('Me').implement({
  description: 'Текущий пользователь',
  fields: (t) => ({
    id: t.exposeID('id'),
    email: t.exposeString('email'),
    role: t.exposeString('role'),
    emailVerified: t.exposeBoolean('emailVerified'),
    totpEnabled: t.exposeBoolean('totpEnabled'),
    passkeyCount: t.exposeInt('passkeyCount'),
    mfaPassed: t.exposeBoolean('mfaPassed'),
    createdAt: t.field({ type: 'DateTime', resolve: (m) => m.createdAt }),
  }),
});

export const AuthStatus = builder.enumType('AuthStatus', {
  description: 'OK — вход завершён, NEEDS_TOTP — ждём код из приложения-аутентификатора',
  values: ['OK', 'NEEDS_TOTP'] as const,
});

export interface AuthResultShape {
  status: 'OK' | 'NEEDS_TOTP';
  me: MeShape | null;
}

export const AuthResultRef = builder.objectRef<AuthResultShape>('AuthResult').implement({
  fields: (t) => ({
    status: t.field({ type: AuthStatus, resolve: (r) => r.status }),
    me: t.field({ type: MeRef, nullable: true, resolve: (r) => r.me }),
  }),
});

export interface SessionInfoShape {
  id: string;
  deviceLabel: string | null;
  ip: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  current: boolean;
}

export const SessionInfoRef = builder.objectRef<SessionInfoShape>('SessionInfo').implement({
  description: 'Активный вход на устройстве',
  fields: (t) => ({
    id: t.exposeID('id'),
    deviceLabel: t.exposeString('deviceLabel', { nullable: true }),
    ip: t.exposeString('ip', { nullable: true }),
    current: t.exposeBoolean('current'),
    createdAt: t.field({ type: 'DateTime', resolve: (s) => s.createdAt }),
    lastSeenAt: t.field({ type: 'DateTime', resolve: (s) => s.lastSeenAt }),
    expiresAt: t.field({ type: 'DateTime', resolve: (s) => s.expiresAt }),
  }),
});
