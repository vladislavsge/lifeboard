// Установка на домашний экран (Android/Chrome даёт событие, iOS — только инструкция).
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

class Pwa {
  prompt = $state.raw<InstallPrompt | null>(null);
  installed = $state(
    typeof matchMedia !== 'undefined' &&
      (matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true),
  );
}

export const pwa = new Pwa();

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  pwa.prompt = e as InstallPrompt;
});

window.addEventListener('appinstalled', () => {
  pwa.prompt = null;
  pwa.installed = true;
});

export async function install() {
  const p = pwa.prompt;
  if (!p) return;
  await p.prompt();
  await p.userChoice.catch(() => undefined);
  pwa.prompt = null;
}

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
