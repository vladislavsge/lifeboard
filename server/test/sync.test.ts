// Синхронизация: ревизии, конфликты, журнал прошлых версий.
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { createInvite } from '../src/auth/invite.js';
import { GOOD_PASSWORD, REGISTER, gql, makeApp, resetDb } from './helpers.js';

let app: FastifyInstance;
let cookie: string;

const PUSH = `mutation($d:String!,$i:[CollectionPush!]!){
  pushCollections(deviceId:$d, items:$i){
    accepted{ name rev itemCount }
    conflicts{ name rev itemCount payload }
  }
}`;
const PULL = `query($s:[CollectionRev!]!){
  sync(since:$s){ changed{ name rev payload itemCount } heads{ name rev } }
}`;
const OVERWRITE = `mutation($d:String!,$n:String!,$p:JSON!){
  overwriteCollection(deviceId:$d,name:$n,payload:$p){ name rev itemCount }
}`;

const tx = (n: number) => Array.from({ length: n }, (_, i) => ({ id: 'tx' + i, amount: i }));
const push = (items: { name: string; baseRev: number; payload: unknown }[], device = 'device-a') =>
  gql(app, PUSH, { d: device, i: items }, cookie);

beforeAll(async () => {
  app = await makeApp();
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDb();
  const code = await createInvite({ maxUses: 1 });
  const reg = await gql(app, REGISTER, { e: 'sync@example.com', p: GOOD_PASSWORD, c: code });
  cookie = reg.cookie!;
});

describe('отправка коллекций', () => {
  it('первая отправка создаёт ревизию 1', async () => {
    const res = await push([{ name: 'transactions', baseRev: 0, payload: tx(3) }]);
    const accepted = (res.data as any).pushCollections.accepted;
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toMatchObject({ name: 'transactions', rev: 1, itemCount: 3 });
  });

  it('повторная отправка тех же данных не двигает ревизию', async () => {
    await push([{ name: 'transactions', baseRev: 0, payload: tx(3) }]);
    const res = await push([{ name: 'transactions', baseRev: 1, payload: tx(3) }]);
    expect((res.data as any).pushCollections.accepted[0].rev).toBe(1);
  });

  it('устаревшая ревизия даёт конфликт и не затирает сервер', async () => {
    await push([{ name: 'transactions', baseRev: 0, payload: tx(3) }]);
    await push([{ name: 'transactions', baseRev: 1, payload: tx(5) }]);

    const res = await push([{ name: 'transactions', baseRev: 1, payload: tx(99) }], 'device-b');
    const { accepted, conflicts } = (res.data as any).pushCollections;
    expect(accepted).toHaveLength(0);
    expect(conflicts[0]).toMatchObject({ name: 'transactions', rev: 2, itemCount: 5 });

    const row = await prisma.syncCollection.findFirst({ where: { name: 'transactions' } });
    expect(row?.rev).toBe(2);
    expect((row?.payload as unknown[]).length).toBe(5);
  });

  it('конфликт по одной коллекции не мешает другим', async () => {
    await push([{ name: 'transactions', baseRev: 0, payload: tx(3) }]);
    const res = await push([
      { name: 'transactions', baseRev: 0, payload: tx(4) },
      { name: 'settings', baseRev: 0, payload: { currency: 'EUR' } },
    ]);
    const { accepted, conflicts } = (res.data as any).pushCollections;
    expect(conflicts.map((c: any) => c.name)).toEqual(['transactions']);
    expect(accepted.map((a: any) => a.name)).toEqual(['settings']);
  });

  it('отклоняет слишком большую коллекцию', async () => {
    const big = [{ id: 'x', note: 'д'.repeat(1_100_000) }];
    const res = await push([{ name: 'transactions', baseRev: 0, payload: big }]);
    expect(res.code).toBe('PAYLOAD_TOO_BIG');
  });
});

describe('получение коллекций', () => {
  it('отдаёт только то, что новее', async () => {
    await push([{ name: 'transactions', baseRev: 0, payload: tx(3) }]);
    await push([{ name: 'settings', baseRev: 0, payload: { theme: 'dark' } }]);

    const res = await gql(
      app,
      PULL,
      { s: [{ name: 'transactions', rev: 1 }, { name: 'settings', rev: 0 }] },
      cookie,
    );
    const { changed, heads } = (res.data as any).sync;
    expect(changed.map((c: any) => c.name)).toEqual(['settings']);
    expect(heads).toHaveLength(2);
  });

  it('данные возвращаются в целости', async () => {
    const payload = [{ id: 'a', amount: 1234, note: 'кофе ☕' }];
    await push([{ name: 'transactions', baseRev: 0, payload }]);
    const res = await gql(app, PULL, { s: [{ name: 'transactions', rev: 0 }] }, cookie);
    expect((res.data as any).sync.changed[0].payload).toEqual(payload);
  });
});

describe('перезапись в конфликте', () => {
  it('поднимает ревизию и сохраняет прошлую версию в журнал', async () => {
    await push([{ name: 'transactions', baseRev: 0, payload: tx(3) }]);
    const res = await gql(app, OVERWRITE, { d: 'device-b', n: 'transactions', p: tx(1) }, cookie);
    expect((res.data as any).overwriteCollection).toMatchObject({ rev: 2, itemCount: 1 });

    const journal = await prisma.syncRevision.findMany({ where: { name: 'transactions' } });
    expect(journal).toHaveLength(1);
    expect((journal[0]!.payload as unknown[]).length).toBe(3);
  });
});

describe('чужие данные', () => {
  it('другой аккаунт не видит коллекции первого', async () => {
    await push([{ name: 'transactions', baseRev: 0, payload: tx(3) }]);
    const code = await createInvite({ maxUses: 1 });
    const other = await gql(app, REGISTER, { e: 'other@example.com', p: GOOD_PASSWORD, c: code });

    const res = await gql(app, PULL, { s: [{ name: 'transactions', rev: 0 }] }, other.cookie);
    expect((res.data as any).sync.changed).toHaveLength(0);
    expect((res.data as any).sync.heads).toHaveLength(0);
  });
});
