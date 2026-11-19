// Passkeys: вход по Face ID / отпечатку и управление ключами.
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { builder } from './builder.js';
import { AuthResultRef, fail, loadMe, requireUser } from './types.js';
import type { AuthResultShape } from './types.js';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import {
  authenticationOptions,
  registrationOptions,
  verifyAuthentication,
  verifyRegistration,
} from '../auth/webauthn.js';
import { createSession, setSessionCookie } from '../auth/session.js';

interface PasskeyShape {
  id: string;
  label: string | null;
  deviceType: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
}

const PasskeyRef = builder.objectRef<PasskeyShape>('Passkey').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    label: t.exposeString('label', { nullable: true }),
    deviceType: t.exposeString('deviceType', { nullable: true }),
    createdAt: t.field({ type: 'DateTime', resolve: (p) => p.createdAt }),
    lastUsedAt: t.field({ type: 'DateTime', nullable: true, resolve: (p) => p.lastUsedAt }),
  }),
});

const WebauthnOptionsRef = builder
  .objectRef<{ handle: string; options: unknown }>('WebauthnOptions')
  .implement({
    description: 'Параметры для navigator.credentials. handle вернуть при проверке',
    fields: (t) => ({
      handle: t.exposeString('handle'),
      options: t.field({ type: 'JSON', resolve: (o) => o.options }),
    }),
  });

builder.queryFields((t) => ({
  passkeys: t.field({
    type: [PasskeyRef],
    resolve: async (_p, _a, ctx) => {
      const user = requireUser(ctx);
      return prisma.passkey.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, label: true, deviceType: true, createdAt: true, lastUsedAt: true },
      });
    },
  }),
}));

builder.mutationFields((t) => ({
  startPasskeyRegistration: t.field({
    type: WebauthnOptionsRef,
    resolve: async (_p, _a, ctx) => registrationOptions(requireUser(ctx)),
  }),

  finishPasskeyRegistration: t.field({
    type: PasskeyRef,
    args: {
      handle: t.arg.string({ required: true }),
      response: t.arg({ type: 'JSON', required: true }),
      label: t.arg.string(),
    },
    resolve: async (_p, args, ctx) => {
      const user = requireUser(ctx);
      const created = await verifyRegistration({
        handle: args.handle,
        response: args.response as RegistrationResponseJSON,
        userId: user.id,
        label: args.label ?? null,
      });
      if (!created) throw fail('Не удалось подтвердить ключ — попробуйте ещё раз', 'PASSKEY_FAILED');
      await audit('passkey_added', { userId: user.id, ip: ctx.ip, userAgent: ctx.userAgent });
      return created;
    },
  }),

  startPasskeyLogin: t.field({
    type: WebauthnOptionsRef,
    description: 'Без почты — вход ключом, который сам себя опознаёт',
    args: { email: t.arg.string() },
    resolve: async (_p, args) => authenticationOptions(args.email),
  }),

  finishPasskeyLogin: t.field({
    type: AuthResultRef,
    args: {
      handle: t.arg.string({ required: true }),
      response: t.arg({ type: 'JSON', required: true }),
    },
    resolve: async (_p, args, ctx): Promise<AuthResultShape> => {
      const ok = await verifyAuthentication({
        handle: args.handle,
        response: args.response as AuthenticationResponseJSON,
      });
      if (!ok) throw fail('Ключ не подошёл', 'PASSKEY_FAILED');

      const user = await prisma.user.findUnique({
        where: { id: ok.userId },
        select: {
          id: true,
          email: true,
          role: true,
          emailVerifiedAt: true,
          createdAt: true,
          disabledAt: true,
        },
      });
      if (!user || user.disabledAt) throw fail('Доступ закрыт', 'ACCOUNT_DISABLED');

      // passkey — сильный фактор сам по себе, второй шаг не нужен
      const { raw, id } = await createSession({
        userId: user.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        mfaPassed: true,
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
      ctx.session = { id, userId: user.id, mfaPassedAt: new Date(), createdAt: new Date() };
      await audit('passkey_login', { userId: user.id, ip: ctx.ip, userAgent: ctx.userAgent });
      return { status: 'OK', me: await loadMe(sessionUser, true) };
    },
  }),

  renamePasskey: t.boolean({
    args: { id: t.arg.id({ required: true }), label: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const user = requireUser(ctx);
      const res = await prisma.passkey.updateMany({
        where: { id: String(args.id), userId: user.id },
        data: { label: args.label.slice(0, 80) },
      });
      if (!res.count) throw fail('Ключ не найден', 'NOT_FOUND');
      return true;
    },
  }),

  deletePasskey: t.boolean({
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const user = requireUser(ctx);
      const res = await prisma.passkey.deleteMany({ where: { id: String(args.id), userId: user.id } });
      if (!res.count) throw fail('Ключ не найден', 'NOT_FOUND');
      await audit('passkey_removed', { userId: user.id, ip: ctx.ip });
      return true;
    },
  }),
}));
