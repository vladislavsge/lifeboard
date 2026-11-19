// Второй фактор: подключение TOTP, ввод кода при входе, коды восстановления.
import { builder } from './builder.js';
import { AuthResultRef, fail, loadMe, requireSession, requireUser } from './types.js';
import type { AuthResultShape } from './types.js';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { decrypt, encrypt } from '../auth/crypto.js';
import { checkTotp, newTotpSecret, otpauthUrl } from '../auth/totp.js';
import { recoveryCodesLeft, replaceRecoveryCodes, useRecoveryCode } from '../auth/recovery.js';
import { verifySecret } from '../auth/password.js';
import { createSession, revokeSession, setSessionCookie } from '../auth/session.js';
import { assertCanTry, recordAttempt } from '../auth/ratelimit.js';

const TotpEnrollRef = builder
  .objectRef<{ secret: string; otpauthUrl: string }>('TotpEnroll')
  .implement({
    description: 'Данные для подключения аутентификатора. Показываются один раз',
    fields: (t) => ({
      secret: t.exposeString('secret', { description: 'Код для ручного ввода' }),
      otpauthUrl: t.exposeString('otpauthUrl', { description: 'Строка для QR-кода' }),
    }),
  });

/** Переводит текущий вход в состояние «второй фактор пройден». */
async function passMfa(
  ctx: Parameters<typeof requireSession>[0],
  user: { id: string; email: string; role: 'user' | 'admin'; emailVerifiedAt: Date | null; createdAt: Date },
  oldSessionId: string,
): Promise<AuthResultShape> {
  // новая сессия вместо половинчатой — чтобы прежний токен не получил полных прав
  await revokeSession(oldSessionId);
  const { raw, id } = await createSession({
    userId: user.id,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    mfaPassed: true,
  });
  setSessionCookie(ctx.reply, raw);
  ctx.session = { id, userId: user.id, mfaPassedAt: new Date(), createdAt: new Date() };
  return { status: 'OK', me: await loadMe(user, true) };
}

builder.queryFields((t) => ({
  recoveryCodesLeft: t.int({
    description: 'Сколько кодов восстановления ещё не использовано',
    resolve: async (_p, _a, ctx) => recoveryCodesLeft(requireUser(ctx).id),
  }),
}));

builder.mutationFields((t) => ({
  startTotpEnroll: t.field({
    type: TotpEnrollRef,
    description: 'Создаёт секрет. Пока не подтверждён кодом — второй фактор не включается',
    resolve: async (_p, _a, ctx) => {
      const user = requireUser(ctx);
      const existing = await prisma.totpSecret.findUnique({ where: { userId: user.id } });
      if (existing?.confirmedAt) throw fail('Двухфакторная проверка уже включена', 'TOTP_ALREADY_ON');

      const secret = newTotpSecret();
      await prisma.totpSecret.upsert({
        where: { userId: user.id },
        create: { userId: user.id, secretEnc: encrypt(secret) },
        update: { secretEnc: encrypt(secret), confirmedAt: null, lastStep: null },
      });
      return { secret, otpauthUrl: otpauthUrl(secret, user.email) };
    },
  }),

  confirmTotpEnroll: t.field({
    type: ['String'],
    description: 'Подтверждает подключение и выдаёт коды восстановления (показать один раз)',
    args: { code: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const user = requireUser(ctx);
      const row = await prisma.totpSecret.findUnique({ where: { userId: user.id } });
      if (!row) throw fail('Сначала начните подключение', 'TOTP_NOT_STARTED');
      if (row.confirmedAt) throw fail('Двухфакторная проверка уже включена', 'TOTP_ALREADY_ON');

      const step = checkTotp(decrypt(row.secretEnc), user.email, args.code);
      if (step === null) {
        await audit('totp_failed', { userId: user.id, ip: ctx.ip, meta: { at: 'enroll' } });
        throw fail('Код не подошёл. Проверьте время на телефоне', 'TOTP_INVALID');
      }

      await prisma.totpSecret.update({
        where: { userId: user.id },
        data: { confirmedAt: new Date(), lastStep: BigInt(step) },
      });
      const codes = await replaceRecoveryCodes(user.id);
      await audit('totp_enabled', { userId: user.id, ip: ctx.ip, userAgent: ctx.userAgent });
      return codes;
    },
  }),

  verifyTotp: t.field({
    type: AuthResultRef,
    description: 'Ввод кода после входа по паролю',
    args: { code: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx): Promise<AuthResultShape> => {
      const { user, session } = requireSession(ctx);
      if (session.mfaPassedAt) return { status: 'OK', me: await loadMe(user, true) };

      await assertCanTry(user.email, ctx.ip);
      const row = await prisma.totpSecret.findUnique({ where: { userId: user.id } });
      if (!row?.confirmedAt) throw fail('Двухфакторная проверка не настроена', 'TOTP_NOT_SET');

      const step = checkTotp(decrypt(row.secretEnc), user.email, args.code);
      const replayed = step !== null && row.lastStep !== null && BigInt(step) <= row.lastStep;
      if (step === null || replayed) {
        await recordAttempt(user.email, ctx.ip, false);
        await audit('totp_failed', { userId: user.id, ip: ctx.ip, meta: { replayed } });
        throw fail(replayed ? 'Этот код уже использован — дождитесь следующего' : 'Код не подошёл', 'TOTP_INVALID');
      }

      await prisma.totpSecret.update({ where: { userId: user.id }, data: { lastStep: BigInt(step) } });
      await recordAttempt(user.email, ctx.ip, true);
      return passMfa(ctx, user, session.id);
    },
  }),

  useRecoveryCode: t.field({
    type: AuthResultRef,
    description: 'Запасной вход, если аутентификатор недоступен',
    args: { code: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx): Promise<AuthResultShape> => {
      const { user, session } = requireSession(ctx);
      if (session.mfaPassedAt) return { status: 'OK', me: await loadMe(user, true) };

      await assertCanTry(user.email, ctx.ip);
      if (!(await useRecoveryCode(user.id, args.code))) {
        await recordAttempt(user.email, ctx.ip, false);
        await audit('totp_failed', { userId: user.id, ip: ctx.ip, meta: { at: 'recovery' } });
        throw fail('Код восстановления не подошёл', 'RECOVERY_INVALID');
      }
      await recordAttempt(user.email, ctx.ip, true);
      const left = await recoveryCodesLeft(user.id);
      await audit('recovery_code_used', { userId: user.id, ip: ctx.ip, meta: { left } });
      return passMfa(ctx, user, session.id);
    },
  }),

  regenerateRecoveryCodes: t.field({
    type: ['String'],
    args: { password: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const user = requireUser(ctx);
      const row = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { passwordHash: true },
      });
      if (!(await verifySecret(row.passwordHash, args.password))) {
        throw fail('Пароль не подошёл', 'INVALID_CREDENTIALS');
      }
      return replaceRecoveryCodes(user.id);
    },
  }),

  disableTotp: t.boolean({
    description: 'Отключает второй фактор. Требует пароль',
    args: { password: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const user = requireUser(ctx);
      const row = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { passwordHash: true },
      });
      if (!(await verifySecret(row.passwordHash, args.password))) {
        throw fail('Пароль не подошёл', 'INVALID_CREDENTIALS');
      }
      await prisma.$transaction([
        prisma.totpSecret.deleteMany({ where: { userId: user.id } }),
        prisma.recoveryCode.deleteMany({ where: { userId: user.id } }),
      ]);
      await audit('totp_disabled', { userId: user.id, ip: ctx.ip, userAgent: ctx.userAgent });
      return true;
    },
  }),
}));
