// Регистрация, вход, сессии, смена и восстановление пароля.
import { builder } from './builder.js';
import { AuthResultRef, MeRef, SessionInfoRef, fail, loadMe, requireUser } from './types.js';
import type { AuthResultShape } from './types.js';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { audit } from '../audit.js';
import { hashSecret, passwordProblem, verifySecret } from '../auth/password.js';
import { randomToken, sha256 } from '../auth/crypto.js';
import {
  clearSessionCookie,
  createSession,
  revokeAll,
  revokeSession,
  setSessionCookie,
} from '../auth/session.js';
import { assertCanTry, emailKey, recordAttempt } from '../auth/ratelimit.js';
import { consumeInvite, releaseInvite } from '../auth/invite.js';
import { mailEnabled, sendResetEmail, sendVerifyEmail } from '../mail/index.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Хэш-пустышка: проверяем пароль даже для несуществующей почты,
 *  чтобы по времени ответа нельзя было понять, есть ли такой аккаунт. */
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashSecret(randomToken(16)));

const AuthConfigRef = builder
  .objectRef<{ openRegistration: boolean; mailEnabled: boolean }>('AuthConfig')
  .implement({
    description: 'Что сервер разрешает на экране входа',
    fields: (t) => ({
      openRegistration: t.exposeBoolean('openRegistration'),
      mailEnabled: t.exposeBoolean('mailEnabled'),
    }),
  });

builder.queryFields((t) => ({
  authConfig: t.field({
    type: AuthConfigRef,
    description: 'Открыта ли регистрация и настроена ли почта',
    resolve: () => ({ openRegistration: env.AUTH_OPEN_REGISTRATION, mailEnabled: mailEnabled() }),
  }),

  me: t.field({
    type: MeRef,
    nullable: true,
    description: 'Текущий пользователь или null, если входа нет',
    resolve: async (_p, _a, ctx) =>
      ctx.user ? loadMe(ctx.user, ctx.session?.mfaPassedAt != null) : null,
  }),

  sessions: t.field({
    type: [SessionInfoRef],
    description: 'Активные входы на устройствах',
    resolve: async (_p, _a, ctx) => {
      const user = requireUser(ctx);
      const rows = await prisma.session.findMany({
        where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { lastSeenAt: 'desc' },
      });
      return rows.map((s) => ({
        id: s.id,
        deviceLabel: s.deviceLabel,
        ip: s.ip,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        expiresAt: s.expiresAt,
        current: s.id === ctx.session?.id,
      }));
    },
  }),
}));

builder.mutationFields((t) => ({
  register: t.field({
    type: AuthResultRef,
    args: {
      email: t.arg.string({ required: true }),
      password: t.arg.string({ required: true }),
      inviteCode: t.arg.string(),
    },
    resolve: async (_p, args, ctx): Promise<AuthResultShape> => {
      const email = emailKey(args.email);
      if (!EMAIL_RE.test(email)) throw fail('Проверьте адрес почты', 'BAD_EMAIL');
      const problem = passwordProblem(args.password);
      if (problem) throw fail(problem, 'WEAK_PASSWORD');

      const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (taken) throw fail('Эта почта уже зарегистрирована', 'EMAIL_TAKEN');

      let inviteId: string | null = null;
      if (!env.AUTH_OPEN_REGISTRATION) {
        if (!args.inviteCode) throw fail('Регистрация по приглашению — нужен код', 'INVITE_REQUIRED');
        inviteId = await consumeInvite(args.inviteCode);
        if (!inviteId) throw fail('Код приглашения не подошёл или уже использован', 'INVITE_INVALID');
      } else if (args.inviteCode) {
        inviteId = await consumeInvite(args.inviteCode);
      }

      // первый аккаунт в пустой базе получает права администратора
      const firstUser = (await prisma.user.count()) === 0;
      let user;
      try {
        user = await prisma.user.create({
          data: {
            email,
            passwordHash: await hashSecret(args.password),
            role: firstUser ? 'admin' : 'user',
          },
          select: { id: true, email: true, role: true, emailVerifiedAt: true, createdAt: true },
        });
      } catch (e) {
        if (inviteId) await releaseInvite(inviteId);
        throw e;
      }

      if (inviteId) await audit('invite_used', { userId: user.id, ip: ctx.ip, meta: { inviteId } });
      await audit('register', { userId: user.id, ip: ctx.ip, userAgent: ctx.userAgent });

      if (env.AUTH_OPEN_REGISTRATION && mailEnabled()) {
        const token = randomToken(32);
        await prisma.emailToken.create({
          data: {
            userId: user.id,
            kind: 'verify',
            tokenHash: sha256(token),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
        await sendVerifyEmail(user.email, token).catch((e) => console.error('[mail]', e));
      }

      const { raw, id } = await createSession({
        userId: user.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        mfaPassed: true,
      });
      setSessionCookie(ctx.reply, raw);
      ctx.user = user;
      ctx.session = { id, userId: user.id, mfaPassedAt: new Date(), createdAt: new Date() };
      return { status: 'OK', me: await loadMe(user, true) };
    },
  }),

  login: t.field({
    type: AuthResultRef,
    args: { email: t.arg.string({ required: true }), password: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx): Promise<AuthResultShape> => {
      const email = emailKey(args.email);
      await assertCanTry(email, ctx.ip);

      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          role: true,
          emailVerifiedAt: true,
          createdAt: true,
          disabledAt: true,
          passwordHash: true,
        },
      });

      const ok = user
        ? user.disabledAt === null && (await verifySecret(user.passwordHash, args.password))
        : await verifySecret(await getDummyHash(), args.password);

      if (!ok || !user) {
        await recordAttempt(email, ctx.ip, false);
        await audit('login_failed', { userId: user?.id ?? null, ip: ctx.ip, userAgent: ctx.userAgent });
        throw fail('Неверная почта или пароль', 'INVALID_CREDENTIALS');
      }
      await recordAttempt(email, ctx.ip, true);

      const totp = await prisma.totpSecret.findUnique({
        where: { userId: user.id },
        select: { confirmedAt: true },
      });
      const needsTotp = totp?.confirmedAt != null;

      const { raw, id } = await createSession({
        userId: user.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        mfaPassed: !needsTotp,
      });
      setSessionCookie(ctx.reply, raw);

      const sessionUser = {
        id: user.id,
        email: user.email,
        role: user.role,
        emailVerifiedAt: user.emailVerifiedAt,
        createdAt: user.createdAt,
      };
      ctx.user = sessionUser;
      ctx.session = {
        id,
        userId: user.id,
        mfaPassedAt: needsTotp ? null : new Date(),
        createdAt: new Date(),
      };
      await audit('login', { userId: user.id, ip: ctx.ip, userAgent: ctx.userAgent, meta: { needsTotp } });

      return {
        status: needsTotp ? 'NEEDS_TOTP' : 'OK',
        me: await loadMe(sessionUser, !needsTotp),
      };
    },
  }),

  logout: t.boolean({
    resolve: async (_p, _a, ctx) => {
      if (ctx.session) {
        await revokeSession(ctx.session.id);
        await audit('logout', { userId: ctx.session.userId, ip: ctx.ip });
      }
      clearSessionCookie(ctx.reply);
      ctx.user = null;
      ctx.session = null;
      return true;
    },
  }),

  logoutEverywhere: t.int({
    description: 'Выйти на всех устройствах, кроме текущего. Возвращает число закрытых сессий',
    resolve: async (_p, _a, ctx) => {
      const user = requireUser(ctx);
      const count = await revokeAll(user.id, ctx.session?.id);
      await audit('logout_all', { userId: user.id, ip: ctx.ip, meta: { count } });
      return count;
    },
  }),

  revokeSession: t.boolean({
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const user = requireUser(ctx);
      const target = await prisma.session.findUnique({
        where: { id: String(args.id) },
        select: { userId: true },
      });
      if (!target || target.userId !== user.id) throw fail('Сессия не найдена', 'NOT_FOUND');
      await revokeSession(String(args.id));
      await audit('session_revoked', { userId: user.id, ip: ctx.ip, meta: { sessionId: String(args.id) } });
      if (ctx.session?.id === String(args.id)) {
        clearSessionCookie(ctx.reply);
        ctx.user = null;
        ctx.session = null;
      }
      return true;
    },
  }),

  changePassword: t.boolean({
    args: {
      currentPassword: t.arg.string({ required: true }),
      newPassword: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const user = requireUser(ctx);
      const row = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { passwordHash: true },
      });
      if (!(await verifySecret(row.passwordHash, args.currentPassword))) {
        await audit('login_failed', { userId: user.id, ip: ctx.ip, meta: { at: 'changePassword' } });
        throw fail('Текущий пароль не подошёл', 'INVALID_CREDENTIALS');
      }
      const problem = passwordProblem(args.newPassword);
      if (problem) throw fail(problem, 'WEAK_PASSWORD');

      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashSecret(args.newPassword) },
      });
      // старые входы больше не действуют, текущее устройство получает новую сессию
      await revokeAll(user.id);
      const { raw, id } = await createSession({
        userId: user.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        mfaPassed: true,
      });
      setSessionCookie(ctx.reply, raw);
      ctx.session = { id, userId: user.id, mfaPassedAt: new Date(), createdAt: new Date() };
      await audit('password_changed', { userId: user.id, ip: ctx.ip, userAgent: ctx.userAgent });
      return true;
    },
  }),

  requestPasswordReset: t.boolean({
    description: 'Всегда возвращает true — по ответу нельзя узнать, есть ли такой аккаунт',
    args: { email: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const email = emailKey(args.email);
      const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
      if (user && mailEnabled()) {
        const token = randomToken(32);
        await prisma.emailToken.create({
          data: {
            userId: user.id,
            kind: 'reset',
            tokenHash: sha256(token),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          },
        });
        await sendResetEmail(user.email, token).catch((e) => console.error('[mail]', e));
        await audit('password_reset_requested', { userId: user.id, ip: ctx.ip });
      }
      return true;
    },
  }),

  resetPassword: t.boolean({
    args: { token: t.arg.string({ required: true }), newPassword: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const problem = passwordProblem(args.newPassword);
      if (problem) throw fail(problem, 'WEAK_PASSWORD');

      const row = await prisma.emailToken.findUnique({ where: { tokenHash: sha256(args.token) } });
      if (!row || row.kind !== 'reset' || row.usedAt || row.expiresAt <= new Date()) {
        throw fail('Ссылка устарела — запросите смену пароля заново', 'TOKEN_INVALID');
      }
      await prisma.$transaction([
        prisma.emailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
        prisma.user.update({
          where: { id: row.userId },
          data: { passwordHash: await hashSecret(args.newPassword) },
        }),
      ]);
      await revokeAll(row.userId);
      clearSessionCookie(ctx.reply);
      ctx.user = null;
      ctx.session = null;
      await audit('password_reset', { userId: row.userId, ip: ctx.ip, userAgent: ctx.userAgent });
      return true;
    },
  }),

  verifyEmail: t.boolean({
    args: { token: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const row = await prisma.emailToken.findUnique({ where: { tokenHash: sha256(args.token) } });
      if (!row || row.kind !== 'verify' || row.usedAt || row.expiresAt <= new Date()) {
        throw fail('Ссылка устарела — запросите письмо заново', 'TOKEN_INVALID');
      }
      await prisma.$transaction([
        prisma.emailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
        prisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } }),
      ]);
      await audit('email_verified', { userId: row.userId, ip: ctx.ip });
      return true;
    },
  }),
}));
