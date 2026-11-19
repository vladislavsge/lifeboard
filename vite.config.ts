import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// В dev GraphQL живёт отдельным сервером (docker compose), но ходим на него через
// тот же origin, что и приложение, — так cookie сессии ведут себя как в prod,
// где фронт и /graphql стоят за одним Caddy.
const api = process.env.VITE_API_PROXY ?? 'http://localhost:4000';
const inDocker = !!process.env.VITE_DOCKER;

export default defineConfig({
  plugins: [svelte()],
  // относительные пути — сайт можно положить в любую папку (GitHub Pages, Netlify, просто на диск)
  base: './',
  build: { target: 'es2020', cssMinify: true },
  // собранную версию отдаёт `npm run preview` — через неё проверяют
  // уведомления и установку на телефон (нужен service worker)
  preview: {
    proxy: {
      '/graphql': { target: api, ws: false },
      '/healthz': { target: api },
    },
  },
  server: {
    proxy: {
      '/graphql': { target: api, ws: false },
      '/healthz': { target: api },
    },
    // в контейнере файлы приходят через bind-mount с Windows: события не доходят, нужен опрос
    watch: inDocker ? { usePolling: true, interval: 300 } : undefined,
  },
});
