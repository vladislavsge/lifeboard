// Сборка Fastify с GraphQL. Отдельно от index.ts, чтобы тесты могли
// поднять приложение без прослушивания порта (app.inject).
import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import { createYoga } from 'graphql-yoga';
import type { Plugin } from 'graphql-yoga';
import { NoSchemaIntrospectionCustomRule } from 'graphql';
import { env, isProd } from './env.js';
import { prisma } from './db.js';
import { buildContext } from './context.js';
import { schema } from './schema/index.js';
import { depthLimit } from './graphql/limits.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    trustProxy: env.TRUST_PROXY,
    // запас на синхронизацию коллекций (лимит на коллекцию проверяется отдельно)
    bodyLimit: 8 * 1024 * 1024,
  });

  await app.register(cookie);

  app.get('/healthz', async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch (e) {
      app.log.error({ err: e }, 'healthz: база недоступна');
      reply.code(503);
      return { status: 'db-unavailable' };
    }
  });

  // CSRF: один origin, поэтому достаточно проверить, откуда пришёл запрос.
  // Мутации ходят только POST — GraphQL Yoga сам не пускает их через GET.
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/graphql') || req.method !== 'POST') return;
    const origin = req.headers.origin;
    const site = req.headers['sec-fetch-site'];
    const sameSite = site === undefined || site === 'same-origin' || site === 'none';
    if ((origin && !env.APP_ORIGINS.includes(origin)) || !sameSite) {
      req.log.warn({ origin, site }, 'запрос с чужого origin отклонён');
      return reply.code(403).send({ errors: [{ message: 'Запрос с другого сайта отклонён' }] });
    }
  });

  // Ограничители: глубина запроса и закрытая интроспекция в prod.
  const limits: Plugin = {
    onValidate({ addValidationRule }) {
      addValidationRule(depthLimit(12));
      if (isProd) addValidationRule(NoSchemaIntrospectionCustomRule);
    },
  };

  const yoga = createYoga<{ req: FastifyRequest; reply: FastifyReply }>({
    schema,
    graphqlEndpoint: '/graphql',
    graphiql: !isProd,
    landingPage: false,
    maskedErrors: isProd,
    batching: false,
    context: ({ req, reply }) => buildContext(req, reply),
    logging: {
      debug: (...a) => app.log.debug(a),
      info: (...a) => app.log.info(a),
      warn: (...a) => app.log.warn(a),
      error: (...a) => app.log.error(a),
    },
    plugins: [limits],
  });

  app.route({
    url: '/graphql',
    method: ['GET', 'POST', 'OPTIONS'],
    handler: async (req, reply) => {
      const res = await yoga.handleNodeRequestAndResponse(req, reply, { req, reply });
      res.headers.forEach((value, key) => {
        // cookie ставим через reply.setCookie, чтобы не склеивать несколько Set-Cookie
        if (key.toLowerCase() !== 'set-cookie') reply.header(key, value);
      });
      reply.status(res.status);
      return reply.send(await res.text());
    },
  });

  return app;
}
