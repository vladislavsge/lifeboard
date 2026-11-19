// Отправка push-уведомлений. Своими ключами VAPID, без сторонних сервисов:
// сервер обращается прямо к push-службам Apple и Google.
import webpush from 'web-push';
import { prisma } from '../db.js';
import { env } from '../env.js';

/** Сколько подряд неудач терпим, прежде чем забыть подписку */
const MAX_FAILURES = 5;

if (env.pushEnabled) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
}

export interface Payload {
  title: string;
  body: string;
  /** маршрут приложения, куда открыть по нажатию */
  url?: string | null;
  /** чтобы новое уведомление заменяло прежнее по той же теме */
  tag?: string;
}

export interface SendResult {
  sent: number;
  removed: number;
}

/**
 * Отправляет уведомление на все устройства пользователя.
 * Подписки, которые push-служба объявила недействительными (404 и 410),
 * удаляются сразу: держать их нет смысла.
 */
export async function sendToUser(userId: string, payload: Payload): Promise<SendResult> {
  if (!env.pushEnabled) return { sent: 0, removed: 0 };

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (!subs.length) return { sent: 0, removed: 0 };

  const text = JSON.stringify(payload);
  let sent = 0;
  let removed = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        text,
        { TTL: 60 * 60 },
      );
      sent++;
      await prisma.pushSubscription.update({
        where: { id: sub.id },
        data: { lastSentAt: new Date(), failures: 0 },
      });
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      const gone = status === 404 || status === 410;
      if (gone || sub.failures + 1 >= MAX_FAILURES) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
        removed++;
      } else {
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { failures: { increment: 1 } },
        });
        console.warn('[push] не удалось отправить', { status, endpoint: sub.endpoint.slice(0, 60) });
      }
    }
  }
  return { sent, removed };
}
