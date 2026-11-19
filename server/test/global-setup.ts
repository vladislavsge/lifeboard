// Готовит тестовую базу: создаёт её и накатывает миграции.
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { ADMIN_DATABASE_URL, TEST_DATABASE_URL, TEST_DB, applyTestEnv } from './env.js';

export default async function setup(): Promise<void> {
  applyTestEnv();

  const admin = new PrismaClient({ datasourceUrl: ADMIN_DATABASE_URL });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE IF NOT EXISTS \`${TEST_DB}\``);
  } catch (e) {
    throw new Error(
      'Не удалось создать тестовую базу. Поднят ли MySQL (npm run docker:dev)?\n' +
        (e instanceof Error ? e.message : String(e)),
    );
  } finally {
    await admin.$disconnect();
  }

  execSync('npx prisma migrate deploy', {
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
