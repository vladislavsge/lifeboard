import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    // тесты делят одну базу, поэтому выполняем их последовательно
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
