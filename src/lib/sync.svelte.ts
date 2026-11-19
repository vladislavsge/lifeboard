// Синхронизация с аккаунтом: коллекции целиком, с номером ревизии.
//
// Что отправлять, решает контрольная сумма, посчитанная здесь же, на клиенте:
// база может сохранить JSON с другим порядком ключей, поэтому сравнивать
// свою сумму с серверной нельзя — сравниваем только свою со своей.
import { kvGet, kvSet } from './db';
import { gql, isOffline, isUnauthenticated } from './api';
import { KEYS, applyRemote, data, onCollectionChange, snapshotOf } from './store.svelte';
import type { Data } from './store.svelte';
import { nowLocal, uid } from './utils';
import { uploadPlan } from './push.svelte';

const META_KEY = '_sync';
const PUSH_DEBOUNCE_MS = 3000;
const PULL_EVERY_MS = 60_000;

interface Meta {
  deviceId: string;
  /** последнее, что мы успешно обменяли с сервером */
  collections: Record<string, { rev: number; checksum: string }>;
  lastSyncAt?: string;
}

export interface Conflict {
  name: string;
  serverRev: number;
  serverItems: number;
  serverUpdatedAt: string;
  serverPayload: unknown;
  localItems: number;
}

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'offline' | 'error';

class Sync {
  on = $state(false);
  status = $state<SyncStatus>('off');
  lastSyncAt = $state<string | undefined>(undefined);
  conflicts = $state<Conflict[]>([]);
  error = $state('');
  /** первый вход на этом устройстве, а данные есть и тут, и там */
  firstSync = $state<{ serverItems: number; localItems: number } | null>(null);
}

export const sync = new Sync();

let meta: Meta = { deviceId: '', collections: {} };
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let pullTimer: ReturnType<typeof setInterval> | undefined;
let busy = false;
/** коллекции с неразрешённым конфликтом — их не трогаем, пока человек не решит */
const blocked = new Set<string>();

const PULL = `query($since:[CollectionRev!]!){
  sync(since:$since){
    changed{ name rev payload itemCount updatedAt }
    heads{ name rev itemCount updatedAt }
  }
}`;

const PUSH = `mutation($d:String!,$i:[CollectionPush!]!){
  pushCollections(deviceId:$d, items:$i){
    accepted{ name rev }
    conflicts{ name rev itemCount updatedAt payload }
  }
}`;

const OVERWRITE = `mutation($d:String!,$n:String!,$p:JSON!){
  overwriteCollection(deviceId:$d, name:$n, payload:$p){ name rev }
}`;

interface Head {
  name: string;
  rev: number;
  itemCount: number;
  updatedAt: string;
}
interface State extends Head {
  payload: unknown;
}

/** Имя коллекции приходит с сервера строкой — приводим к ключу хранилища. */
const snap = (name: string): unknown => snapshotOf(name as keyof Data);

/**
 * Быстрый хэш без crypto.subtle: он доступен только в «безопасном контексте»
 * (https или localhost), а по http в локальной сети — нет. Сумма нужна лишь
 * для ответа «данные изменились?», сравнивается только со своей же,
 * поэтому криптостойкость тут не требуется.
 */
function weakHash(text: string): string {
  const pass = (seed: number): string => {
    let h = seed;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  };
  return pass(0x811c9dc5) + pass(0x9e3779b9);
}

async function checksum(value: unknown): Promise<string> {
  const text = JSON.stringify(value) ?? 'null';
  const subtle = globalThis.crypto?.subtle;
  // префикс алгоритма: при переходе с http на https сумма просто не совпадёт
  // и уедет один лишний пуш — данные при этом не пострадают
  if (!subtle) return 'w:' + weakHash(text);
  const hash = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return (
    's:' +
    Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * На свежем устройстве счета и категории уже заполнены справочниками
 * по умолчанию, а настройки есть всегда. Считать их «своими данными» нельзя:
 * иначе на новом телефоне появился бы лишний вопрос, чьи данные оставить.
 */
const SEEDED = new Set<string>(['settings', 'accounts', 'categories']);

const countItems = (names: { name: string; itemCount: number }[]): number =>
  names.reduce((sum, h) => (SEEDED.has(h.name) ? sum : sum + h.itemCount), 0);

const localItems = (): number =>
  KEYS.reduce((sum, k) => {
    if (SEEDED.has(k)) return sum;
    const v = data[k];
    return sum + (Array.isArray(v) ? v.length : 0);
  }, 0);

async function saveMeta(): Promise<void> {
  await kvSet(META_KEY, meta);
}

async function loadMeta(): Promise<void> {
  const saved = await kvGet<Meta>(META_KEY);
  meta = saved?.deviceId ? saved : { deviceId: uid() + uid().slice(-4), collections: {} };
  sync.lastSyncAt = meta.lastSyncAt;
  if (!saved?.deviceId) await saveMeta();
}

function fail(e: unknown): void {
  if (isOffline(e)) {
    sync.status = 'offline';
    return;
  }
  if (isUnauthenticated(e)) {
    stop();
    return;
  }
  sync.status = 'error';
  sync.error = e instanceof Error ? e.message : 'Не получилось синхронизировать';
  console.warn('[sync]', e);
}

function done(): void {
  sync.status = sync.conflicts.length ? 'error' : 'idle';
  sync.lastSyncAt = nowLocal();
  meta.lastSyncAt = sync.lastSyncAt;
  void saveMeta();
  // данные изменились — пересчитываем расписание напоминаний
  void uploadPlan();
}

/** Применяет пришедшие коллекции и запоминает их ревизии. */
async function applyChanged(changed: State[]): Promise<void> {
  if (!changed.length) return;
  const patch: Record<string, unknown> = {};
  for (const c of changed) patch[c.name] = c.payload;
  applyRemote(patch);
  // сумму считаем уже по тому, что лежит в хранилище после миграций
  for (const c of changed) {
    meta.collections[c.name] = { rev: c.rev, checksum: await checksum(snap(c.name)) };
  }
  await saveMeta();
}

async function pull(): Promise<Head[]> {
  const since = KEYS.map((k) => ({ name: k, rev: meta.collections[k]?.rev ?? 0 }));
  const d = await gql<{ sync: { changed: State[]; heads: Head[] } }>(PULL, { since });
  await applyChanged(d.sync.changed.filter((c) => !blocked.has(c.name)));
  return d.sync.heads;
}

/** Отправляет коллекции, которые изменились с прошлого обмена. */
async function push(): Promise<void> {
  const items: { name: string; baseRev: number; payload: unknown }[] = [];
  const sums = new Map<string, string>();

  const sizes = new Map<string, number>();

  for (const k of KEYS) {
    if (blocked.has(k)) continue;
    const payload = snapshotOf(k);
    const sum = await checksum(payload);
    if (meta.collections[k]?.checksum === sum) continue;
    sums.set(k, sum);
    sizes.set(k, (JSON.stringify(payload) ?? '').length);
    items.push({ name: k, baseRev: meta.collections[k]?.rev ?? 0, payload });
  }
  if (!items.length) return;

  // На сервере тело запроса ограничено 8 МБ. Обычно весь трекер — десятки
  // килобайт, но если коллекции разрослись, отправляем их порциями.
  const BATCH_LIMIT = 3 * 1024 * 1024;
  const batches: (typeof items)[] = [];
  let batch: typeof items = [];
  let batchSize = 0;
  for (const item of items) {
    const size = sizes.get(item.name) ?? 0;
    if (batch.length && batchSize + size > BATCH_LIMIT) {
      batches.push(batch);
      batch = [];
      batchSize = 0;
    }
    batch.push(item);
    batchSize += size;
  }
  if (batch.length) batches.push(batch);

  for (const part of batches) {
    const d = await gql<{
      pushCollections: { accepted: { name: string; rev: number }[]; conflicts: State[] };
    }>(PUSH, { d: meta.deviceId, i: part });

    for (const a of d.pushCollections.accepted) {
      meta.collections[a.name] = { rev: a.rev, checksum: sums.get(a.name) ?? '' };
    }

    for (const c of d.pushCollections.conflicts) {
      blocked.add(c.name);
      const local = snap(c.name);
      const conflict: Conflict = {
        name: c.name,
        serverRev: c.rev,
        serverItems: c.itemCount,
        serverUpdatedAt: c.updatedAt,
        serverPayload: c.payload,
        localItems: Array.isArray(local) ? local.length : 1,
      };
      sync.conflicts = [...sync.conflicts.filter((x) => x.name !== c.name), conflict];
    }
  }
  await saveMeta();
}

/** Полный цикл: сначала забрать чужое, потом отдать своё. */
async function cycle(): Promise<void> {
  if (!sync.on || busy) return;
  busy = true;
  sync.status = 'syncing';
  try {
    await pull();
    await push();
    done();
  } catch (e) {
    fail(e);
  } finally {
    busy = false;
  }
}

export function scheduleSync(): void {
  if (!sync.on) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void cycle(), PUSH_DEBOUNCE_MS);
}

/** Решение при первом входе на устройстве: чьи данные считать главными. */
export async function chooseFirstSync(which: 'server' | 'mine'): Promise<void> {
  sync.firstSync = null;
  sync.status = 'syncing';
  try {
    if (which === 'server') {
      // забираем всё с сервера, локальные правки этого устройства теряются
      meta.collections = {};
      await pull();
    } else {
      for (const k of KEYS) {
        const payload = snapshotOf(k);
        const d = await gql<{ overwriteCollection: { name: string; rev: number } }>(OVERWRITE, {
          d: meta.deviceId,
          n: k,
          p: payload,
        });
        meta.collections[k] = { rev: d.overwriteCollection.rev, checksum: await checksum(payload) };
      }
    }
    await saveMeta();
    done();
  } catch (e) {
    fail(e);
  }
}

/** Разрешение конфликта по одной коллекции. */
export async function resolveConflict(name: string, which: 'server' | 'mine'): Promise<void> {
  const conflict = sync.conflicts.find((c) => c.name === name);
  if (!conflict) return;
  sync.status = 'syncing';
  try {
    if (which === 'server') {
      blocked.delete(name);
      await applyChanged([
        {
          name,
          rev: conflict.serverRev,
          payload: conflict.serverPayload,
          itemCount: conflict.serverItems,
          updatedAt: conflict.serverUpdatedAt,
        },
      ]);
    } else {
      const payload = snap(name);
      const d = await gql<{ overwriteCollection: { rev: number } }>(OVERWRITE, {
        d: meta.deviceId,
        n: name,
        p: payload,
      });
      meta.collections[name] = { rev: d.overwriteCollection.rev, checksum: await checksum(payload) };
      blocked.delete(name);
      await saveMeta();
    }
    sync.conflicts = sync.conflicts.filter((c) => c.name !== name);
    done();
  } catch (e) {
    fail(e);
  }
}

export async function syncNow(): Promise<void> {
  clearTimeout(pushTimer);
  await cycle();
}

export async function start(): Promise<void> {
  if (sync.on) return;
  await loadMeta();
  sync.on = true;
  sync.status = 'syncing';
  sync.error = '';

  try {
    const firstTime = Object.keys(meta.collections).length === 0;
    if (firstTime) {
      const since = KEYS.map((k) => ({ name: k, rev: 0 }));
      const d = await gql<{ sync: { changed: State[]; heads: Head[] } }>(PULL, { since });
      const serverItems = countItems(d.sync.heads);
      const mine = localItems();
      if (serverItems > 0 && mine > 0) {
        // и там, и там есть записи — молча склеивать нельзя, спрашиваем человека
        sync.firstSync = { serverItems, localItems: mine };
        sync.status = 'idle';
        return;
      }
      if (serverItems > 0) await applyChanged(d.sync.changed);
    }
    await cycle();
  } catch (e) {
    fail(e);
  }

  clearInterval(pullTimer);
  pullTimer = setInterval(() => void cycle(), PULL_EVERY_MS);
}

export function stop(): void {
  sync.on = false;
  sync.status = 'off';
  sync.conflicts = [];
  sync.firstSync = null;
  blocked.clear();
  clearTimeout(pushTimer);
  clearInterval(pullTimer);
}

/** Забыть состояние обмена — например, при выходе из аккаунта. */
export async function forgetSyncState(): Promise<void> {
  stop();
  meta = { deviceId: meta.deviceId || uid(), collections: {} };
  sync.lastSyncAt = undefined;
  await saveMeta();
}

// любое изменение коллекции ставит отправку в очередь
onCollectionChange(() => scheduleSync());

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
    else if (sync.on) {
      // вкладку закрывают — пробуем успеть отправить
      clearTimeout(pushTimer);
      void push().catch(() => undefined);
    }
  });
  window.addEventListener('online', () => void syncNow());
}
