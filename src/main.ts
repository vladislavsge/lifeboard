import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { loadData } from './lib/store.svelte';
import './lib/pwa.svelte';

const app = mount(App, { target: document.getElementById('app')! });

loadData();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

export default app;
