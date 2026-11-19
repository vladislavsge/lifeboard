// Приглашения. Сам код виден только в момент создания —
// в базе лежит хэш, поэтому «подсмотреть» выданный код нельзя.
import { builder } from './builder.js';
import { fail, requireAdmin } from './types.js';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { createInvite } from '../auth/invite.js';

interface InviteShape {
  id: string;
  maxUses: number;
  usedCount: number;
  note: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

const InviteRef = builder.objectRef<InviteShape>('Invite').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    maxUses: t.exposeInt('maxUses'),
    usedCount: t.exposeInt('usedCount'),
    note: t.exposeString('note', { nullable: true }),
    expiresAt: t.field({ type: 'DateTime', nullable: true, resolve: (i) => i.expiresAt }),
    revokedAt: t.field({ type: 'DateTime', nullable: true, resolve: (i) => i.revokedAt }),
    createdAt: t.field({ type: 'DateTime', resolve: (i) => i.createdAt }),
  }),
});

builder.queryFields((t) => ({
  invites: t.field({
    type: [InviteRef],
    description: 'Выданные приглашения (без самих кодов)',
    resolve: async (_p, _a, ctx) => {
      requireAdmin(ctx);
      return prisma.invite.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    },
  }),
}));

builder.mutationFields((t) => ({
  createInvite: t.string({
    description: 'Возвращает код. Показать его можно только сейчас',
    args: {
      maxUses: t.arg.int({ defaultValue: 1 }),
      days: t.arg.int(),
      note: t.arg.string(),
    },
    resolve: async (_p, args, ctx) => {
      const admin = requireAdmin(ctx);
      const maxUses = Math.min(Math.max(args.maxUses ?? 1, 1), 50);
      const code = await createInvite({
        createdById: admin.id,
        maxUses,
        days: args.days ?? null,
        note: args.note ?? null,
      });
      await audit('invite_created', { userId: admin.id, ip: ctx.ip, meta: { maxUses, days: args.days ?? null } });
      return code;
    },
  }),

  revokeInvite: t.boolean({
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_p, args, ctx) => {
      requireAdmin(ctx);
      const res = await prisma.invite.updateMany({
        where: { id: String(args.id), revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (!res.count) throw fail('Приглашение не найдено', 'NOT_FOUND');
      return true;
    },
  }),
}));
