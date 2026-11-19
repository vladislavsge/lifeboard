// Регистрация по приглашению, вход, блокировка перебора, сессии.
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { createInvite } from '../src/auth/invite.js';
import { TEST_ORIGIN_ALT } from './env.js';
import { GOOD_PASSWORD, LOGIN, REGISTER, gql, makeApp, resetDb } from './helpers.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await makeApp();
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(resetDb);

const EMAIL = 'kto@example.com';

async function registerWithInvite() {
  const code = await createInvite({ maxUses: 1 });
  return gql(app, REGISTER, { e: EMAIL, p: GOOD_PASSWORD, c: code });
}

describe('регистрация', () => {
  it('без кода приглашения не пускает', async () => {
    const res = await gql(app, REGISTER, { e: EMAIL, p: GOOD_PASSWORD });
    expect(res.code).toBe('INVITE_REQUIRED');
    expect(await prisma.user.count()).toBe(0);
  });

  it('с неверным кодом не пускает', async () => {
    const res = await gql(app, REGISTER, { e: EMAIL, p: GOOD_PASSWORD, c: 'ZZZZ-ZZZZ-ZZZZ' });
    expect(res.code).toBe('INVITE_INVALID');
  });

  it('по коду создаёт аккаунт, первый из них — администратор', async () => {
    const res = await registerWithInvite();
    expect(res.code).toBeUndefined();
    expect((res.data as any).register.status).toBe('OK');
    expect((res.data as any).register.me.role).toBe('admin');
    expect(res.cookie).toMatch(/^sid=/);
  });

  it('тратит приглашение: второй раз тем же кодом нельзя', async () => {
    const code = await createInvite({ maxUses: 1 });
    await gql(app, REGISTER, { e: EMAIL, p: GOOD_PASSWORD, c: code });
    const second = await gql(app, REGISTER, { e: 'another@example.com', p: GOOD_PASSWORD, c: code });
    expect(second.code).toBe('INVITE_INVALID');
  });

  it('не даёт занять одну почту дважды и не тратит приглашение зря', async () => {
    await registerWithInvite();
    const code = await createInvite({ maxUses: 1 });
    const res = await gql(app, REGISTER, { e: EMAIL, p: GOOD_PASSWORD, c: code });
    expect(res.code).toBe('EMAIL_TAKEN');
    const invite = await prisma.invite.findFirst({ orderBy: { createdAt: 'desc' } });
    expect(invite?.usedCount).toBe(0);
  });

  it('отклоняет слабый пароль', async () => {
    const code = await createInvite({ maxUses: 1 });
    const res = await gql(app, REGISTER, { e: EMAIL, p: 'korotko', c: code });
    expect(res.code).toBe('WEAK_PASSWORD');
  });
});

describe('вход', () => {
  beforeEach(registerWithInvite);

  it('пускает с верным паролем', async () => {
    const res = await gql(app, LOGIN, { e: EMAIL, p: GOOD_PASSWORD });
    expect((res.data as any).login.status).toBe('OK');
    expect((res.data as any).login.me.mfaPassed).toBe(true);
  });

  it('не пускает с неверным', async () => {
    const res = await gql(app, LOGIN, { e: EMAIL, p: 'ne-tot-parol-123' });
    expect(res.code).toBe('INVALID_CREDENTIALS');
  });

  it('не выдаёт, существует ли аккаунт', async () => {
    const miss = await gql(app, LOGIN, { e: 'nikogo@example.com', p: 'ne-tot-parol-123' });
    const hit = await gql(app, LOGIN, { e: EMAIL, p: 'ne-tot-parol-123' });
    expect(miss.message).toBe(hit.message);
  });

  it('блокирует после пяти неудач', async () => {
    for (let i = 0; i < 5; i++) await gql(app, LOGIN, { e: EMAIL, p: 'ne-tot-parol-123' });
    const res = await gql(app, LOGIN, { e: EMAIL, p: GOOD_PASSWORD });
    expect(res.code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('удачный вход обнуляет счётчик неудач', async () => {
    for (let i = 0; i < 4; i++) await gql(app, LOGIN, { e: EMAIL, p: 'ne-tot-parol-123' });
    await gql(app, LOGIN, { e: EMAIL, p: GOOD_PASSWORD });
    expect(await prisma.loginAttempt.count({ where: { ok: false } })).toBe(0);
  });
});

describe('сессия', () => {
  it('без cookie данные недоступны', async () => {
    const res = await gql(app, '{ sessions { id } }');
    expect(res.code).toBe('UNAUTHENTICATED');
  });

  it('с cookie доступны, после выхода — нет', async () => {
    const reg = await registerWithInvite();
    const cookie = reg.cookie!;

    const ok = await gql(app, '{ me { email } sessions { current } }', undefined, cookie);
    expect((ok.data as any).me.email).toBe(EMAIL);
    expect((ok.data as any).sessions).toHaveLength(1);

    await gql(app, 'mutation{ logout }', undefined, cookie);
    const after = await gql(app, '{ me { email } }', undefined, cookie);
    expect((after.data as any).me).toBeNull();
  });

  it('смена пароля закрывает входы на других устройствах', async () => {
    const first = await registerWithInvite();
    const second = await gql(app, LOGIN, { e: EMAIL, p: GOOD_PASSWORD });

    const res = await gql(
      app,
      'mutation($c:String!,$n:String!){ changePassword(currentPassword:$c,newPassword:$n) }',
      { c: GOOD_PASSWORD, n: 'drugoy-parol-9911' },
      second.cookie,
    );
    expect((res.data as any).changePassword).toBe(true);

    // прежняя сессия больше не действует
    const old = await gql(app, '{ me { email } }', undefined, first.cookie);
    expect((old.data as any).me).toBeNull();
    // текущее устройство получило новую рабочую сессию
    const now = await gql(app, '{ me { email } }', undefined, res.cookie);
    expect((now.data as any).me.email).toBe(EMAIL);
  });

  it('чужую сессию закрыть нельзя', async () => {
    const mine = await registerWithInvite();
    const code = await createInvite({ maxUses: 1 });
    const other = await gql(app, REGISTER, { e: 'other@example.com', p: GOOD_PASSWORD, c: code });
    const otherSessions = await gql(app, '{ sessions { id } }', undefined, other.cookie);
    const victimId = (otherSessions.data as any).sessions[0].id;

    const res = await gql(app, 'mutation($id:ID!){ revokeSession(id:$id) }', { id: victimId }, mine.cookie);
    expect(res.code).toBe('NOT_FOUND');
  });
});

describe('защита от запросов с чужого сайта', () => {
  const ask = (origin: string) =>
    app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { 'content-type': 'application/json', origin },
      payload: { query: '{ authConfig { openRegistration } }' },
    });

  it('отклоняет POST с чужого Origin', async () => {
    expect((await ask('https://evil.example')).statusCode).toBe(403);
  });

  it('пускает со второго разрешённого адреса (проверка с телефона)', async () => {
    const res = await ask(TEST_ORIGIN_ALT);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.authConfig).toBeDefined();
  });

  it('не пускает с похожего, но не указанного адреса', async () => {
    expect((await ask('http://192.168.0.51:5173')).statusCode).toBe(403);
  });
});
