// Навигация (hash-роутер), нижние «шторки» (sheets), тосты и диалог подтверждения.
// Шторки кладут запись в history — системная кнопка «назад» на телефоне закрывает их.
import type { Component } from 'svelte';
import { uid } from './utils';

/* ---------- Роутер ---------- */

class Router {
  path = $state('/');
  stack: string[] = [];
}
export const router = new Router();

const readHash = () => decodeURIComponent(location.hash.replace(/^#/, '')) || '/';

function onHash() {
  const p = readHash();
  const st = router.stack;
  if (st.length > 1 && st[st.length - 2] === p) st.pop();
  else if (st[st.length - 1] !== p) st.push(p);
  router.path = p;
  window.scrollTo(0, 0);
}

router.path = readHash();
router.stack.push(router.path);
window.addEventListener('hashchange', onHash);

let pendingPath: string | null = null;

export function go(path: string) {
  const n = ui.sheets.length;
  if (n) {
    // сначала закрываем шторки (убираем их записи из history), потом переходим
    ui.sheets = [];
    pendingPath = path;
    history.go(-n);
    return;
  }
  if (readHash() === path) return;
  location.hash = path;
}

/** переход без новой записи в истории (вкладки внутри раздела) */
export function replaceRoute(path: string) {
  if (readHash() === path) return;
  router.stack[router.stack.length - 1] = path;
  location.replace('#' + path);
}

/** «Назад» в шапке: если пришли с родительской страницы — шаг назад по истории, иначе — на fallback */
export function goBack(fallback = '/') {
  const st = router.stack;
  if (st.length > 1) history.back();
  else {
    location.replace('#' + fallback);
  }
}

/* ---------- Шторки, тосты, подтверждения ---------- */

interface SheetEntry {
  id: string;
  component: Component<any>;
  props: Record<string, unknown>;
}

interface ToastState {
  id: string;
  text: string;
  action?: { label: string; fn: () => void };
}

interface ConfirmState {
  title?: string;
  text: string;
  ok: string;
  danger: boolean;
  resolve: (v: boolean) => void;
}

class UI {
  sheets = $state.raw<SheetEntry[]>([]);
  toast = $state.raw<ToastState | null>(null);
  confirm = $state.raw<ConfirmState | null>(null);
}
export const ui = new UI();

export function openSheet<P extends Record<string, any>>(component: Component<P>, props?: Omit<P, 'close'>) {
  ui.sheets = [...ui.sheets, { id: uid(), component: component as Component<any>, props: (props ?? {}) as Record<string, unknown> }];
  history.pushState({ sheet: ui.sheets.length }, '');
}

/** заменить верхнюю шторку другой (без шагов по истории) */
export function replaceSheet<P extends Record<string, any>>(component: Component<P>, props?: Omit<P, 'close'>) {
  if (!ui.sheets.length) return openSheet(component, props);
  ui.sheets = [...ui.sheets.slice(0, -1), { id: uid(), component: component as Component<any>, props: (props ?? {}) as Record<string, unknown> }];
}

export function closeSheet() {
  if (ui.sheets.length) history.back();
}

window.addEventListener('popstate', () => {
  const depth = (history.state && (history.state as { sheet?: number }).sheet) || 0;
  if (ui.sheets.length > depth) ui.sheets = ui.sheets.slice(0, depth);
  if (pendingPath !== null) {
    const p = pendingPath;
    pendingPath = null;
    if (readHash() !== p) location.hash = p;
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (ui.confirm) {
      ui.confirm.resolve(false);
      ui.confirm = null;
    } else closeSheet();
  }
});

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(text: string, action?: { label: string; fn: () => void }) {
  clearTimeout(toastTimer);
  ui.toast = { id: uid(), text, action };
  toastTimer = setTimeout(() => (ui.toast = null), action ? 5000 : 2200);
}

export function hideToast() {
  clearTimeout(toastTimer);
  ui.toast = null;
}

export function ask(text: string, opts: { title?: string; ok?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    ui.confirm = { text, title: opts.title, ok: opts.ok ?? 'Да', danger: opts.danger ?? false, resolve };
  });
}

export function answerConfirm(v: boolean) {
  ui.confirm?.resolve(v);
  ui.confirm = null;
}
