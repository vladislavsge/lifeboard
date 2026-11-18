// Минимальная обёртка над IndexedDB: одно хранилище "kv", ключ = имя коллекции.
// Если IndexedDB недоступен (приватный режим старых браузеров) — откатываемся на localStorage.

const DB_NAME = 'lifeboard';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

const hasIDB = typeof indexedDB !== 'undefined';

export async function kvGet<T>(key: string): Promise<T | undefined> {
  if (hasIDB) {
    try {
      return await tx<T | undefined>('readonly', (s) => s.get(key));
    } catch {
      /* fallback ниже */
    }
  }
  try {
    const raw = localStorage.getItem('lb:' + key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  if (hasIDB) {
    try {
      await tx('readwrite', (s) => s.put(value, key));
      return;
    } catch {
      /* fallback ниже */
    }
  }
  try {
    localStorage.setItem('lb:' + key, JSON.stringify(value));
  } catch (e) {
    console.error('Не удалось сохранить', key, e);
  }
}

export async function kvClear(): Promise<void> {
  if (hasIDB) {
    try {
      await tx('readwrite', (s) => s.clear());
    } catch {
      /* ignore */
    }
  }
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('lb:'))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
