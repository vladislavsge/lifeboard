import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { loadData } from './lib/store.svelte';
import { go } from './lib/nav.svelte';
import './lib/pwa.svelte';

const app = mount(App, { target: document.getElementById('app')! });

loadData();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  // нажали на уведомление — открываем нужный раздел
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
    const msg = e.data as { type?: string; path?: string } | undefined;
    if (msg?.type === 'navigate' && typeof msg.path === 'string') go(msg.path);
  });
}

export default app;
