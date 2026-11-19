// Контекст одного GraphQL-запроса: база, адрес клиента, cookie и текущая сессия.
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from './db.js';
import { resolveSession } from './auth/session.js';
import type { ActiveSession, SessionUser } from './auth/session.js';

export interface Ctx {
  prisma: typeof prisma;
  req: FastifyRequest;
  reply: FastifyReply;
  /** IP с учётом X-Forwarded-For (Fastify разбирает его при trustProxy) */
  ip: string;
  userAgent: string;
  /** Поля меняются прямо в резолвере входа, чтобы ответ уже знал о новой сессии */
  user: SessionUser | null;
  session: ActiveSession | null;
}

export async function buildContext(req: FastifyRequest, reply: FastifyReply): Promise<Ctx> {
  const found = await resolveSession(req, reply);
  return {
    prisma,
    req,
    reply,
    ip: req.ip ?? '',
    userAgent: String(req.headers['user-agent'] ?? '').slice(0, 400),
    user: found?.user ?? null,
    session: found?.session ?? null,
  };
}
