// Общие помощники интеграционных тестов: приложение, запросы, чистая база.
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { TEST_ORIGIN } from './env.js';

export interface GqlResult<T = Record<string, unknown>> {
  data?: T;
  code?: string;
  message?: string;
  cookie?: string;
  status: number;
}

export async function makeApp(): Promise<FastifyInstance> {
  return buildApp();
}

/** Запрос к /graphql с сохранением cookie сессии. */
export async function gql<T = Record<string, unknown>>(
  app: FastifyInstance,
  query: string,
  variables?: Record<string, unknown>,
  cookie?: string,
): Promise<GqlResult<T>> {
  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: {
      'content-type': 'application/json',
      origin: TEST_ORIGIN,
      ...(cookie ? { cookie } : {}),
    },
    payload: { query, variables },
  });

  const setCookie = res.headers['set-cookie'];
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [String(setCookie)] : [];
  const sid = list.map((c) => c.split(';')[0]).find((c) => c?.startsWith('sid='));

  let body: { data?: T; errors?: { message: string; extensions?: { code?: string } }[] } = {};
  try {
    body = res.json();
  } catch {
    /* не JSON — вернём только статус */
  }

  const err = body.errors?.[0];
  return {
    status: res.statusCode,
    ...(body.data ? { data: body.data } : {}),
    ...(err ? { code: err.extensions?.code ?? 'ERROR', message: err.message } : {}),
    ...(sid ? { cookie: sid } : cookie ? { cookie } : {}),
  };
}

/** Полная очистка данных между тестами. */
export async function resetDb(): Promise<void> {
  const rows = await prisma.$queryRaw<{ TABLE_NAME: string }[]>`
    SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`;
  const tables = rows.map((r) => r.TABLE_NAME).filter((t) => t !== '_prisma_migrations');
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of tables) await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${t}\``);
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
}

export const REGISTER = `mutation($e:String!,$p:String!,$c:String){
  register(email:$e,password:$p,inviteCode:$c){ status me { id email role } }
}`;

export const LOGIN = `mutation($e:String!,$p:String!){
  login(email:$e,password:$p){ status me { email mfaPassed } }
}`;

export const GOOD_PASSWORD = 'korova-bystro-7721';
