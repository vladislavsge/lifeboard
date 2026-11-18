import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  // относительные пути — сайт можно положить в любую папку (GitHub Pages, Netlify, просто на диск)
  base: './',
  build: { target: 'es2020', cssMinify: true },
});
