// Push-уведомления: подписка браузера и отправка расписания на сервер.
//
// Работают только в «безопасном контексте» (https или localhost) и при
// зарегистрированном service worker. На iPhone — лишь для приложения,
// добавленного на экран «Домой», и подписку нужно запрашивать
// непосредственно из обработчика нажатия, иначе iOS её отклонит.
import { gql, isOffline } from './api';
import { planReminders } from './reminders';

class Push {
  /** умеет ли браузер в принципе */
  supported = $state(false);
  /** настроены ли ключи на сервере */
  serverReady = $state(false);
  permission = $state<NotificationPermission>('default');
  subscribed = $state(false);
  busy = $state(false);
  error = $state('');
  /** сколько напоминаний сейчас запланировано на сервере */
  planned = $state(0);
  devices = $state(0);
  nextAt = $state<string | undefined>(undefined);
}

export const push = new Push();

let publicKey = '';

/** Ключ сервера приходит в base64url, а подписке нужен буфер */
const urlBase64ToBuffer = (base64: string): ArrayBuffer => {
  const padded = base64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const raw = atob(padded);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return buffer;
};

const bufToBase64 = (buf: ArrayBuffer | null): string => {
  if (!buf) return '';
  let bin = '';
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin);
};

export const pushSupported = (): boolean =>
  typeof window !== 'undefined' &&
  window.isSecureContext &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  // в dev service worker не регистрируется — уведомления проверяются на сборке
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

/** Узнаёт состояние: поддержка, разрешение, подписка, план на сервере. */
export async function refreshPush(): Promise<void> {
  push.supported = pushSupported();
  if (!push.supported) return;
  push.permission = Notification.permission;

  try {
    const d = await gql<{
      pushConfig: { enabled: boolean; publicKey: string | null };
      pushStatus: { devices: number; pending: number; nextAt: string | null };
    }>('{ pushConfig { enabled publicKey } pushStatus { devices pending nextAt } }');
    push.serverReady = d.pushConfig.enabled;
    publicKey = d.pushConfig.publicKey ?? '';
    push.devices = d.pushStatus.devices;
    push.planned = d.pushStatus.pending;
    push.nextAt = d.pushStatus.nextAt ?? undefined;
  } catch (e) {
    if (!isOffline(e)) console.warn('[push] не удалось получить состояние', e);
    return;
  }

  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  push.subscribed = !!sub;
}

/**
 * Включает уведомления. Вызывать только из обработчика нажатия кнопки:
 * iOS не выдаёт разрешение без явного действия человека.
 */
export async function enablePush(): Promise<void> {
  push.error = '';
  if (!pushSupported()) {
    push.error = 'Браузер не умеет уведомления. На iPhone нужно добавить приложение на экран «Домой».';
    return;
  }
  if (!push.serverReady || !publicKey) {
    push.error = 'На сервере не настроены ключи уведомлений.';
    return;
  }

  push.busy = true;
  try {
    const permission = await Notification.requestPermission();
    push.permission = permission;
    if (permission !== 'granted') {
      push.error =
        permission === 'denied'
          ? 'Уведомления запрещены для этого сайта — разрешите их в настройках браузера.'
          : 'Разрешение не выдано.';
      return;
    }

    const reg = await registration();
    if (!reg) {
      push.error = 'Service worker не зарегистрирован: уведомления работают на собранной версии приложения.';
      return;
    }

    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(publicKey),
      }));

    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    await gql('mutation($e:String!,$p:String!,$a:String!){ subscribePush(endpoint:$e,p256dh:$p,auth:$a) }', {
      e: json.endpoint ?? sub.endpoint,
      p: json.keys?.p256dh ?? bufToBase64(sub.getKey('p256dh')),
      a: json.keys?.auth ?? bufToBase64(sub.getKey('auth')),
    });

    push.subscribed = true;
    await uploadPlan(true);
    await refreshPush();
  } catch (e) {
    push.error = e instanceof Error ? e.message : 'Не удалось включить уведомления';
  } finally {
    push.busy = false;
  }
}

export async function disablePush(): Promise<void> {
  push.busy = true;
  push.error = '';
  try {
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await gql('mutation($e:String!){ unsubscribePush(endpoint:$e) }', { e: sub.endpoint }).catch(() => undefined);
      await sub.unsubscribe().catch(() => undefined);
    }
    push.subscribed = false;
    await refreshPush();
  } catch (e) {
    push.error = e instanceof Error ? e.message : 'Не удалось отключить уведомления';
  } finally {
    push.busy = false;
  }
}

export async function sendTest(): Promise<number> {
  const d = await gql<{ sendTestNotification: number }>('mutation{ sendTestNotification }');
  return d.sendTestNotification;
}

let lastPlan = '';

/**
 * Отправляет расписание на сервер. Пересчитывается дёшево, поэтому зовём
 * после каждой синхронизации, но отправляем только при изменениях.
 */
export async function uploadPlan(force = false): Promise<void> {
  if (!push.subscribed) return;
  try {
    // расчёт плана тоже внутри try: ошибка в данных не должна оставлять
    // необработанное исключение в фоновом вызове
    const items = planReminders();
    const signature = JSON.stringify(items);
    if (!force && signature === lastPlan) return;
    const d = await gql<{ setReminders: number }>(
      'mutation($i:[ReminderInput!]!){ setReminders(items:$i) }',
      { i: items },
    );
    lastPlan = signature;
    push.planned = d.setReminders;
  } catch (e) {
    if (!isOffline(e)) console.warn('[push] не удалось отправить расписание', e);
  }
}
