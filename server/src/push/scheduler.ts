// Доставка напоминаний в срок. Расписание считает клиент (он знает модель
// данных и местное время), сервер только смотрит, чему пора уходить.
import { prisma } from '../db.js';
import { env } from '../env.js';
import { sendToUser } from './send.js';

const TICK_MS = 60_000;
/** Сильно опоздавшие напоминания не отправляем: «выпейте воду» в три утра не нужно */
const TOO_LATE_MS = 6 * 60 * 60 * 1000;
/** Сколько отправляем за один проход, чтобы не упереться в лимиты push-служб */
const BATCH = 100;

let timer: ReturnType<typeof setInterval> | undefined;

export interface TickResult {
  sent: number;
  skipped: number;
}

/** Один проход: отправляет всё, чему пора. */
export async function tick(now = new Date()): Promise<TickResult> {
  if (!env.pushEnabled) return { sent: 0, skipped: 0 };

  const due = await prisma.reminder.findMany({
    where: { sentAt: null, sendAt: { lte: now } },
    orderBy: { sendAt: 'asc' },
    take: BATCH,
  });

  let sent = 0;
  let skipped = 0;
  const tooOld = new Date(now.getTime() - TOO_LATE_MS);

  for (const r of due) {
    if (r.sendAt < tooOld) {
      await prisma.reminder.update({ where: { id: r.id }, data: { sentAt: now } });
      skipped++;
      continue;
    }
    const res = await sendToUser(r.userId, { title: r.title, body: r.body, url: r.url, tag: r.kind });
    await prisma.reminder.update({ where: { id: r.id }, data: { sentAt: new Date() } });
    if (res.sent) sent++;
    else skipped++;
  }

  // отправленные и устаревшие напоминания храним недолго
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  await prisma.reminder.deleteMany({ where: { sentAt: { lt: weekAgo } } });

  return { sent, skipped };
}

export function startScheduler(log: (msg: string, meta?: unknown) => void): void {
  if (!env.pushEnabled) {
    log('push-уведомления выключены: нет ключей VAPID');
    return;
  }
  stopScheduler();
  timer = setInterval(() => {
    void tick().then(
      (r) => r.sent && log('напоминания отправлены', r),
      (e) => log('ошибка отправки напоминаний', e),
    );
  }, TICK_MS);
  log('планировщик напоминаний запущен');
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
