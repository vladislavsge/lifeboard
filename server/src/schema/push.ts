// GraphQL для уведомлений: подписки устройств и расписание напоминаний.
import { builder } from './builder.js';
import { fail, requireUser } from './types.js';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { audit } from '../audit.js';
import { deviceLabel } from '../auth/session.js';
import { sendToUser } from '../push/send.js';

/** Клиент присылает план целиком; больше — признак ошибки, а не сценария */
const MAX_REMINDERS = 200;
const MAX_HORIZON_MS = 60 * 24 * 60 * 60 * 1000;

const PushConfigRef = builder
  .objectRef<{ enabled: boolean; publicKey: string | null }>('PushConfig')
  .implement({
    description: 'Настроены ли уведомления на сервере и ключ для подписки браузера',
    fields: (t) => ({
      enabled: t.exposeBoolean('enabled'),
      publicKey: t.exposeString('publicKey', { nullable: true }),
    }),
  });

const PushStatusRef = builder
  .objectRef<{ devices: number; pending: number; nextAt: Date | null }>('PushStatus')
  .implement({
    fields: (t) => ({
      devices: t.exposeInt('devices', { description: 'Сколько устройств подписано' }),
      pending: t.exposeInt('pending', { description: 'Запланировано напоминаний' }),
      nextAt: t.field({ type: 'DateTime', nullable: true, resolve: (s) => s.nextAt }),
    }),
  });

const ReminderInput = builder.inputType('ReminderInput', {
  fields: (t) => ({
    key: t.string({ required: true, description: 'Стабильный ключ, например goal:<id>:<дата>' }),
    kind: t.string({ required: true }),
    title: t.string({ required: true }),
    body: t.string({ required: true }),
    url: t.string(),
    sendAt: t.field({ type: 'DateTime', required: true }),
  }),
});

builder.queryFields((t) => ({
  pushConfig: t.field({
    type: PushConfigRef,
    resolve: () => ({ enabled: env.pushEnabled, publicKey: env.pushEnabled ? env.VAPID_PUBLIC_KEY : null }),
  }),

  pushStatus: t.field({
    type: PushStatusRef,
    resolve: async (_p, _a, ctx) => {
      const user = requireUser(ctx);
      const [devices, pending, next] = await Promise.all([
        prisma.pushSubscription.count({ where: { userId: user.id } }),
        prisma.reminder.count({ where: { userId: user.id, sentAt: null } }),
        prisma.reminder.findFirst({
          where: { userId: user.id, sentAt: null },
          orderBy: { sendAt: 'asc' },
          select: { sendAt: true },
        }),
      ]);
      return { devices, pending, nextAt: next?.sendAt ?? null };
    },
  }),
}));

builder.mutationFields((t) => ({
  subscribePush: t.boolean({
    description: 'Сохраняет подписку браузера на уведомления',
    args: {
      endpoint: t.arg.string({ required: true }),
      p256dh: t.arg.string({ required: true }),
      auth: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const user = requireUser(ctx);
      if (!env.pushEnabled) throw fail('Уведомления на сервере не настроены', 'PUSH_DISABLED');
      if (args.endpoint.length > 500 || !/^https:\/\//.test(args.endpoint)) {
        throw fail('Неверный адрес подписки', 'BAD_ENDPOINT');
      }
      const data = {
        userId: user.id,
        p256dh: args.p256dh.slice(0, 255),
        auth: args.auth.slice(0, 255),
        deviceLabel: deviceLabel(ctx.userAgent),
        failures: 0,
      };
      // тот же endpoint после перерегистрации — просто обновляем ключи
      await prisma.pushSubscription.upsert({
        where: { endpoint: args.endpoint },
        create: { endpoint: args.endpoint, ...data },
        update: data,
      });
      await audit('push_subscribed', { userId: user.id, ip: ctx.ip, userAgent: ctx.userAgent });
      return true;
    },
  }),

  unsubscribePush: t.boolean({
    args: { endpoint: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const user = requireUser(ctx);
      const res = await prisma.pushSubscription.deleteMany({
        where: { endpoint: args.endpoint, userId: user.id },
      });
      // вместе с подпиской больше незачем держать неотправленные напоминания
      if (!(await prisma.pushSubscription.count({ where: { userId: user.id } }))) {
        await prisma.reminder.deleteMany({ where: { userId: user.id, sentAt: null } });
      }
      await audit('push_unsubscribed', { userId: user.id, ip: ctx.ip });
      return res.count > 0;
    },
  }),

  setReminders: t.int({
    description: 'Заменяет план напоминаний целиком. Возвращает число запланированных',
    args: { items: t.arg({ type: [ReminderInput], required: true }) },
    resolve: async (_p, args, ctx) => {
      const user = requireUser(ctx);
      if (args.items.length > MAX_REMINDERS) throw fail('Слишком много напоминаний за раз', 'TOO_MANY');

      const now = Date.now();
      const items = args.items
        .filter((i) => {
          const at = i.sendAt.getTime();
          return at > now - 60 * 60 * 1000 && at < now + MAX_HORIZON_MS;
        })
        .map((i) => ({
          key: i.key.slice(0, 160),
          kind: i.kind.slice(0, 24),
          title: i.title.slice(0, 120),
          body: i.body.slice(0, 300),
          url: i.url?.slice(0, 200) ?? null,
          sendAt: i.sendAt,
        }));

      const keys = items.map((i) => i.key);
      // то, чего в плане больше нет, уже неактуально — например, цель выполнена
      await prisma.reminder.deleteMany({
        where: { userId: user.id, sentAt: null, ...(keys.length ? { key: { notIn: keys } } : {}) },
      });

      for (const item of items) {
        // sentAt не трогаем: иначе отправленное напоминание ушло бы повторно
        await prisma.reminder.upsert({
          where: { userId_key: { userId: user.id, key: item.key } },
          create: { userId: user.id, ...item },
          update: { kind: item.kind, title: item.title, body: item.body, url: item.url, sendAt: item.sendAt },
        });
      }
      return prisma.reminder.count({ where: { userId: user.id, sentAt: null } });
    },
  }),

  sendTestNotification: t.int({
    description: 'Присылает проверочное уведомление на все устройства. Возвращает число доставок',
    resolve: async (_p, _a, ctx) => {
      const user = requireUser(ctx);
      if (!env.pushEnabled) throw fail('Уведомления на сервере не настроены', 'PUSH_DISABLED');
      const res = await sendToUser(user.id, {
        title: 'Трекер',
        body: 'Уведомления работают. Это проверочное сообщение.',
        url: '/account',
        tag: 'test',
      });
      if (!res.sent && !res.removed) throw fail('Нет подписанных устройств', 'NO_DEVICES');
      return res.sent;
    },
  }),
}));
