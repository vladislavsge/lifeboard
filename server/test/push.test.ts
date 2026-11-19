// Уведомления: подписки, план напоминаний и доставка в срок.
// Настоящая отправка подменена заглушкой — в тестах наружу ничего не уходит.
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const sendNotification = vi.fn();

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: (...args: unknown[]) => sendNotification(...args),
    generateVAPIDKeys: () => ({ publicKey: 'pub', privateKey: 'priv' }),
  },
}));

const { prisma } = await import('../src/db.js');
const { createInvite } = await import('../src/auth/invite.js');
const { tick } = await import('../src/push/scheduler.js');
const { GOOD_PASSWORD, REGISTER, gql, makeApp, resetDb } = await import('./helpers.js');

let app: FastifyInstance;
let cookie: string;
let userId: string;

const SUBSCRIBE = `mutation($e:String!,$p:String!,$a:String!){ subscribePush(endpoint:$e,p256dh:$p,auth:$a) }`;
const SET = `mutation($i:[ReminderInput!]!){ setReminders(items:$i) }`;
const STATUS = '{ pushStatus { devices pending nextAt } }';

const endpoint = (n = 1) => `https://push.example.com/send/${n}`;
const subscribe = (n = 1) => gql(app, SUBSCRIBE, { e: endpoint(n), p: 'key-p256dh', a: 'key-auth' }, cookie);

const reminder = (key: string, minutesFromNow: number) => ({
  key,
  kind: 'goal',
  title: 'Вода',
  body: 'Сегодня 1200 из 2000 мл',
  url: '/t/water',
  sendAt: new Date(Date.now() + minutesFromNow * 60_000).toISOString(),
});

beforeAll(async () => {
  app = await makeApp();
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  sendNotification.mockReset();
  sendNotification.mockResolvedValue({ statusCode: 201 });
  await resetDb();
  const code = await createInvite({ maxUses: 1 });
  const reg = await gql<{ register: { me: { id: string } } }>(
    app,
    REGISTER,
    { e: 'push@example.com', p: GOOD_PASSWORD, c: code },
    undefined,
  );
  cookie = reg.cookie!;
  userId = reg.data!.register.me.id;
});

describe('подписка устройства', () => {
  it('сохраняется и видна в состоянии', async () => {
    await subscribe();
    const res = await gql(app, STATUS, undefined, cookie);
    expect((res.data as any).pushStatus.devices).toBe(1);
  });

  it('повторная подписка тем же адресом не плодит записи', async () => {
    await subscribe();
    await subscribe();
    expect(await prisma.pushSubscription.count({ where: { userId } })).toBe(1);
  });

  it('требует входа', async () => {
    const res = await gql(app, SUBSCRIBE, { e: endpoint(), p: 'p', a: 'a' });
    expect(res.code).toBe('UNAUTHENTICATED');
  });

  it('отклоняет адрес не по https', async () => {
    const res = await gql(app, SUBSCRIBE, { e: 'http://push.example.com/x', p: 'p', a: 'a' }, cookie);
    expect(res.code).toBe('BAD_ENDPOINT');
  });
});

describe('план напоминаний', () => {
  beforeEach(() => subscribe());

  it('сохраняется целиком', async () => {
    const res = await gql(app, SET, { i: [reminder('a', 10), reminder('b', 20)] }, cookie);
    expect((res.data as any).setReminders).toBe(2);
  });

  it('повторная отправка заменяет набор: лишнее удаляется', async () => {
    await gql(app, SET, { i: [reminder('a', 10), reminder('b', 20)] }, cookie);
    const res = await gql(app, SET, { i: [reminder('b', 30)] }, cookie);
    expect((res.data as any).setReminders).toBe(1);
    const keys = await prisma.reminder.findMany({ where: { userId }, select: { key: true } });
    expect(keys.map((k) => k.key)).toEqual(['b']);
  });

  it('отбрасывает слишком далёкие и давно просроченные', async () => {
    const res = await gql(
      app,
      SET,
      { i: [reminder('future', 60 * 24 * 90), reminder('past', -120), reminder('ok', 15)] },
      cookie,
    );
    expect((res.data as any).setReminders).toBe(1);
  });

  it('не оживляет уже отправленное напоминание', async () => {
    await gql(app, SET, { i: [reminder('a', -1)] }, cookie);
    await tick();
    expect(sendNotification).toHaveBeenCalledTimes(1);

    await gql(app, SET, { i: [reminder('a', 5)] }, cookie);
    await tick(new Date(Date.now() + 10 * 60_000));
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });
});

describe('доставка', () => {
  beforeEach(() => subscribe());

  it('отправляет то, чему пришёл срок, и помечает отправленным', async () => {
    await gql(app, SET, { i: [reminder('a', -1), reminder('later', 120)] }, cookie);
    const res = await tick();
    expect(res.sent).toBe(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);

    const payload = JSON.parse(sendNotification.mock.calls[0]![1] as string);
    expect(payload).toMatchObject({ title: 'Вода', url: '/t/water' });
    expect(await prisma.reminder.count({ where: { userId, sentAt: null } })).toBe(1);
  });

  it('не отправляет дважды', async () => {
    await gql(app, SET, { i: [reminder('a', -1)] }, cookie);
    await tick();
    await tick();
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it('сильно опоздавшее не отправляет, но закрывает', async () => {
    await gql(app, SET, { i: [reminder('old', -30)] }, cookie);
    // смотрим так, будто прошло восемь часов
    const res = await tick(new Date(Date.now() + 8 * 60 * 60 * 1000));
    expect(sendNotification).not.toHaveBeenCalled();
    expect(res.skipped).toBe(1);
    expect(await prisma.reminder.count({ where: { userId, sentAt: null } })).toBe(0);
  });

  it('удаляет подписку, если служба ответила 410', async () => {
    sendNotification.mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 410 }));
    await gql(app, SET, { i: [reminder('a', -1)] }, cookie);
    await tick();
    expect(await prisma.pushSubscription.count({ where: { userId } })).toBe(0);
  });

  it('временную ошибку терпит и подписку не трогает', async () => {
    sendNotification.mockRejectedValue(Object.assign(new Error('busy'), { statusCode: 429 }));
    await gql(app, SET, { i: [reminder('a', -1)] }, cookie);
    await tick();
    const sub = await prisma.pushSubscription.findFirst({ where: { userId } });
    expect(sub?.failures).toBe(1);
  });

  it('уходит на все устройства пользователя', async () => {
    await subscribe(2);
    await gql(app, SET, { i: [reminder('a', -1)] }, cookie);
    await tick();
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });
});

describe('отключение', () => {
  it('убирает подписку и неотправленные напоминания', async () => {
    await subscribe();
    await gql(app, SET, { i: [reminder('a', 30)] }, cookie);
    const res = await gql(app, 'mutation($e:String!){ unsubscribePush(endpoint:$e) }', { e: endpoint() }, cookie);
    expect((res.data as any).unsubscribePush).toBe(true);
    expect(await prisma.pushSubscription.count({ where: { userId } })).toBe(0);
    expect(await prisma.reminder.count({ where: { userId, sentAt: null } })).toBe(0);
  });
});

describe('проверочное уведомление', () => {
  it('без устройств отвечает понятной ошибкой', async () => {
    const res = await gql(app, 'mutation{ sendTestNotification }', undefined, cookie);
    expect(res.code).toBe('NO_DEVICES');
  });

  it('с устройством уходит', async () => {
    await subscribe();
    const res = await gql(app, 'mutation{ sendTestNotification }', undefined, cookie);
    expect((res.data as any).sendTestNotification).toBe(1);
  });
});
