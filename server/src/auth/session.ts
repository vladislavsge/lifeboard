// Сессии: непрозрачный токен в cookie, в базе — только его sha256.
// Токен не меняется на каждом запросе (у PWA запросы идут параллельно, и
// гонка оставила бы пользователя без входа) — вместо этого новая сессия
// создаётся при каждом изменении прав: вход, второй фактор, смена пароля.
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { randomToken, sha256 } from './crypto.js';

export const IDLE_DAYS = 30;
export const ABSOLUTE_DAYS = 90;
/** Чаще раза в час продлевать смысла нет — экономим запись в базу */
const RENEW_AFTER_MS = 60 * 60 * 1000;

const days = (n: number) => n * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  role: 'user' | 'admin';
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

export interface ActiveSession {
  id: string;
  userId: string;
  mfaPassedAt: Date | null;
  createdAt: Date;
}

/** Человекопонятное имя устройства из User-Agent — для списка сессий. */
export function deviceLabel(ua: string): string {
  if (!ua) return 'Неизвестное устройство';
  const os = /iPhone|iPad|iPod/i.test(ua)
    ? 'iPhone'
    : /Android/i.test(ua)
      ? 'Android'
      : /Macintosh|Mac OS/i.test(ua)
        ? 'Mac'
        : /Windows/i.test(ua)
          ? 'Windows'
          : /Linux/i.test(ua)
            ? 'Linux'
            : 'Устройство';
  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /OPR\//i.test(ua)
      ? 'Opera'
      : /Firefox\//i.test(ua)
        ? 'Firefox'
        : /Chrome\//i.test(ua)
          ? 'Chrome'
          : /Safari\//i.test(ua)
            ? 'Safari'
            : '';
  return browser ? os + ' · ' + browser : os;
}

export async function createSession(p: {
  userId: string;
  ip: string;
  userAgent: string;
  mfaPassed: boolean;
}): Promise<{ raw: string; id: string }> {
  const raw = randomToken(32);
  const session = await prisma.session.create({
    data: {
      userId: p.userId,
      tokenHash: sha256(raw),
      ip: p.ip.slice(0, 45) || null,
      userAgent: p.userAgent.slice(0, 400) || null,
      deviceLabel: deviceLabel(p.userAgent),
      mfaPassedAt: p.mfaPassed ? new Date() : null,
      expiresAt: new Date(Date.now() + days(IDLE_DAYS)),
    },
    select: { id: true },
  });
  return { raw, id: session.id };
}

export function setSessionCookie(reply: FastifyReply, raw: string): void {
  reply.setCookie(env.sessionCookie, raw, {
    httpOnly: true,
    secure: env.secureCookies,
    sameSite: 'lax',
    path: '/',
    maxAge: IDLE_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(env.sessionCookie, { path: '/' });
}

/** Читает cookie и возвращает живую сессию с пользователем. */
export async function resolveSession(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<{ user: SessionUser; session: ActiveSession } | null> {
  const raw = req.cookies?.[env.sessionCookie];
  if (!raw) return null;

  const found = await prisma.session.findUnique({
    where: { tokenHash: sha256(raw) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          emailVerifiedAt: true,
          createdAt: true,
          disabledAt: true,
        },
      },
    },
  });
  if (!found) {
    clearSessionCookie(reply);
    return null;
  }

  const now = Date.now();
  const dead =
    found.revokedAt !== null ||
    found.expiresAt.getTime() <= now ||
    found.user.disabledAt !== null ||
    now - found.createdAt.getTime() > days(ABSOLUTE_DAYS);
  if (dead) {
    clearSessionCookie(reply);
    return null;
  }

  // продление «скользящего» срока
  if (now - found.lastSeenAt.getTime() > RENEW_AFTER_MS) {
    await prisma.session.update({
      where: { id: found.id },
      data: {
        lastSeenAt: new Date(now),
        expiresAt: new Date(now + days(IDLE_DAYS)),
        ip: req.ip?.slice(0, 45) ?? null,
      },
    });
    setSessionCookie(reply, raw);
  }

  const { user } = found;
  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
    },
    session: {
      id: found.id,
      userId: found.userId,
      mfaPassedAt: found.mfaPassedAt,
      createdAt: found.createdAt,
    },
  };
}

export async function revokeSession(id: string): Promise<void> {
  await prisma.session.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
}

/** Выход на всех устройствах; текущую сессию можно оставить. */
export async function revokeAll(userId: string, exceptId?: string): Promise<number> {
  const res = await prisma.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
    data: { revokedAt: new Date() },
  });
  return res.count;
}

/** Фоновая уборка: просроченные сессии, старые попытки входа и токены писем. */
export async function cleanup(): Promise<void> {
  const now = new Date();
  const dayAgo = new Date(Date.now() - days(1));
  await prisma.session.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: dayAgo } }] },
  });
  await prisma.loginAttempt.deleteMany({ where: { at: { lt: dayAgo } } });
  await prisma.emailToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { lt: dayAgo } }] },
  });
}
