// Синхронизация коллекциями. Сервер не знает модель трекера:
// коллекция — это JSON с номером ревизии. Кто пишет поверх чужой ревизии,
// получает конфликт, а не молчаливую перезапись.
import { createHash } from 'node:crypto';
import { GraphQLError } from 'graphql';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

/** Ограничения, чтобы один аккаунт не занял всю базу. */
export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_COLLECTIONS = 64;
const KEEP_REVISIONS = 20;
const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;

export interface CollectionState {
  name: string;
  rev: number;
  checksum: string;
  payload: unknown;
  itemCount: number;
  updatedAt: Date;
  deviceId: string | null;
}

export type CollectionHead = Omit<CollectionState, 'payload'>;

const fail = (message: string, code: string) => new GraphQLError(message, { extensions: { code } });

const checksumOf = (payload: unknown): string =>
  createHash('sha256').update(JSON.stringify(payload) ?? 'null', 'utf8').digest('hex');

const itemsIn = (payload: unknown): number => (Array.isArray(payload) ? payload.length : 1);

const head = (row: {
  name: string;
  rev: number;
  checksum: string;
  payload: unknown;
  updatedAt: Date;
  deviceId: string | null;
}): CollectionHead => ({
  name: row.name,
  rev: row.rev,
  checksum: row.checksum,
  itemCount: itemsIn(row.payload),
  updatedAt: row.updatedAt,
  deviceId: row.deviceId,
});

const state = (row: {
  name: string;
  rev: number;
  checksum: string;
  payload: unknown;
  updatedAt: Date;
  deviceId: string | null;
}): CollectionState => ({ ...head(row), payload: row.payload });

/** Проверка входных данных до любых записей в базу. */
export function validate(name: string, payload: unknown): { bytes: number; checksum: string } {
  if (!NAME_RE.test(name)) throw fail('Недопустимое имя коллекции: ' + name, 'BAD_COLLECTION');
  if (payload === null || payload === undefined || typeof payload !== 'object') {
    throw fail('Коллекция должна быть массивом или объектом: ' + name, 'BAD_PAYLOAD');
  }
  const bytes = Buffer.byteLength(JSON.stringify(payload) ?? '', 'utf8');
  if (bytes > MAX_BYTES) {
    throw fail(
      `Коллекция «${name}» слишком большая: ${Math.round(bytes / 1024)} КБ при лимите ${MAX_BYTES / 1024} КБ`,
      'PAYLOAD_TOO_BIG',
    );
  }
  return { bytes, checksum: checksumOf(payload) };
}

export interface PushItem {
  name: string;
  baseRev: number;
  payload: unknown;
}

export interface PushOutcome {
  accepted: CollectionHead[];
  conflicts: CollectionState[];
}

/**
 * Записывает коллекцию, если на сервере та же ревизия, которую видел клиент.
 * Иначе возвращает серверную версию как конфликт.
 */
async function pushOne(
  userId: string,
  deviceId: string | null,
  item: PushItem,
): Promise<{ accepted?: CollectionHead; conflict?: CollectionState }> {
  const { bytes, checksum } = validate(item.name, item.payload);
  const payload = item.payload as Prisma.InputJsonValue;
  const current = await prisma.syncCollection.findUnique({
    where: { userId_name: { userId, name: item.name } },
  });

  if (!current) {
    if (item.baseRev !== 0) {
      // клиент думает, что данные на сервере есть, а их нет — пусть решит человек
      return { conflict: { name: item.name, rev: 0, checksum: '', payload: null, itemCount: 0, updatedAt: new Date(0), deviceId: null } };
    }
    const count = await prisma.syncCollection.count({ where: { userId } });
    if (count >= MAX_COLLECTIONS) throw fail('Слишком много коллекций в аккаунте', 'TOO_MANY_COLLECTIONS');
    try {
      const created = await prisma.syncCollection.create({
        data: { userId, name: item.name, rev: 1, checksum, payload, bytes, deviceId },
      });
      return { accepted: head(created) };
    } catch {
      const fresh = await prisma.syncCollection.findUnique({
        where: { userId_name: { userId, name: item.name } },
      });
      return fresh ? { conflict: state(fresh) } : { accepted: undefined };
    }
  }

  if (current.rev !== item.baseRev) return { conflict: state(current) };
  if (current.checksum === checksum) return { accepted: head(current) }; // данные те же — ревизию не двигаем

  // сравнение с ожидаемой ревизией прямо в UPDATE: два параллельных пуша
  // не смогут оба записать rev+1
  const res = await prisma.syncCollection.updateMany({
    where: { id: current.id, rev: item.baseRev },
    data: { rev: item.baseRev + 1, checksum, payload, bytes, deviceId },
  });
  if (res.count !== 1) {
    const fresh = await prisma.syncCollection.findUnique({ where: { id: current.id } });
    return fresh ? { conflict: state(fresh) } : {};
  }

  // прошлую версию — в журнал, на случай «перезаписал зря»
  await prisma.syncRevision.create({
    data: {
      userId,
      name: current.name,
      rev: current.rev,
      checksum: current.checksum,
      payload: current.payload as Prisma.InputJsonValue,
      deviceId: current.deviceId,
    },
  });
  await prisma.syncRevision.deleteMany({
    where: { userId, name: current.name, rev: { lte: current.rev - KEEP_REVISIONS } },
  });

  return {
    accepted: {
      name: current.name,
      rev: item.baseRev + 1,
      checksum,
      itemCount: itemsIn(item.payload),
      updatedAt: new Date(),
      deviceId,
    },
  };
}

export async function push(
  userId: string,
  deviceId: string | null,
  items: PushItem[],
): Promise<PushOutcome> {
  const out: PushOutcome = { accepted: [], conflicts: [] };
  // по очереди: коллекции независимы, а последовательность держит нагрузку предсказуемой
  for (const item of items) {
    const res = await pushOne(userId, deviceId, item);
    if (res.accepted) out.accepted.push(res.accepted);
    if (res.conflict) out.conflicts.push(res.conflict);
  }
  return out;
}

/** Перезапись поверх конфликта: прошлая версия уходит в журнал. */
export async function overwrite(
  userId: string,
  deviceId: string | null,
  item: { name: string; payload: unknown },
): Promise<CollectionHead> {
  const { bytes, checksum } = validate(item.name, item.payload);
  const payload = item.payload as Prisma.InputJsonValue;
  const current = await prisma.syncCollection.findUnique({
    where: { userId_name: { userId, name: item.name } },
  });
  if (!current) {
    const created = await prisma.syncCollection.create({
      data: { userId, name: item.name, rev: 1, checksum, payload, bytes, deviceId },
    });
    return head(created);
  }
  await prisma.syncRevision.create({
    data: {
      userId,
      name: current.name,
      rev: current.rev,
      checksum: current.checksum,
      payload: current.payload as Prisma.InputJsonValue,
      deviceId: current.deviceId,
    },
  });
  const updated = await prisma.syncCollection.update({
    where: { id: current.id },
    data: { rev: current.rev + 1, checksum, payload, bytes, deviceId },
  });
  return head(updated);
}

/** Отдаёт коллекции, которые на сервере новее, чем у клиента. */
export async function pull(
  userId: string,
  since: { name: string; rev: number }[],
): Promise<{ changed: CollectionState[]; heads: CollectionHead[] }> {
  const known = new Map(since.map((s) => [s.name, s.rev]));
  const rows = await prisma.syncCollection.findMany({ where: { userId } });
  const changed = rows.filter((r) => r.rev > (known.get(r.name) ?? 0)).map(state);
  return { changed, heads: rows.map(head) };
}

export async function collection(userId: string, name: string): Promise<CollectionState | null> {
  const row = await prisma.syncCollection.findUnique({ where: { userId_name: { userId, name } } });
  return row ? state(row) : null;
}

/** Сколько места занимают данные аккаунта — показываем в настройках. */
export async function usage(userId: string): Promise<{ bytes: number; collections: number }> {
  const rows = await prisma.syncCollection.findMany({ where: { userId }, select: { bytes: true } });
  return { bytes: rows.reduce((s, r) => s + r.bytes, 0), collections: rows.length };
}
