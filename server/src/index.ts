// Точка входа: поднимает сервер, заводит фоновую уборку и аккуратно останавливается.
import { buildApp } from './app.js';
import { env } from './env.js';
import { disconnect } from './db.js';
import { cleanup } from './auth/session.js';
import { cleanupChallenges } from './auth/webauthn.js';
import { startScheduler, stopScheduler } from './push/scheduler.js';

const app = await buildApp();

// Фоновая уборка: просроченные сессии, старые попытки входа, использованные токены
const SWEEP_EVERY_MS = 6 * 60 * 60 * 1000;
const sweep = async () => {
  try {
    await cleanup();
    await cleanupChallenges();
  } catch (e) {
    app.log.warn({ err: e }, 'фоновая уборка не удалась');
  }
};
const firstSweep = setTimeout(() => void sweep(), 30_000);
const sweepTimer = setInterval(() => void sweep(), SWEEP_EVERY_MS);

startScheduler((msg, meta) => app.log.info({ meta }, msg));

const close = async (signal: string) => {
  app.log.info({ signal }, 'останавливаюсь');
  clearTimeout(firstSweep);
  clearInterval(sweepTimer);
  stopScheduler();
  try {
    await app.close();
    await disconnect();
    process.exit(0);
  } catch (e) {
    app.log.error({ err: e }, 'ошибка при остановке');
    process.exit(1);
  }
};
process.on('SIGTERM', () => void close('SIGTERM'));
process.on('SIGINT', () => void close('SIGINT'));

await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
app.log.info(
  { origin: env.APP_ORIGIN, openRegistration: env.AUTH_OPEN_REGISTRATION },
  `GraphQL на http://localhost:${env.API_PORT}/graphql`,
);
