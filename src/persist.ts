// Everything the machine remembers between boots. IndexedDB underneath, hidden
// behind promises, with an in-memory fallback so it still boots in a private
// window. The transaction auto-commits the moment you stop feeding it, which is
// why withStore() below looks the way it does.

import { syslog } from './bus';

const DB_NAME = 'valkos';
const DB_VERSION = 1;

/** Object stores. `fs` is keyed by absolute path, everything else by string. */
export const STORE = {
  fs: 'fs',
  kv: 'kv',
  blobs: 'blobs',
} as const;

export type StoreName = (typeof STORE)[keyof typeof STORE];

// --- low-level indexeddb plumbing ---

/** Wraps an IDBRequest in a promise. */
function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

/**
 * Opens (and migrates) the database exactly once. Resolves to `null` when the
 * environment has no usable IndexedDB, which switches the whole module over to
 * the memory fallback rather than throwing.
 */
export function openDatabase(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      syslog.warn('storage', 'no IndexedDB in this host - using volatile memory store');
      resolve(null);
      return;
    }

    let open: IDBOpenDBRequest;
    try {
      open = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      syslog.error('storage', `indexedDB.open threw: ${String(err)}`);
      resolve(null);
      return;
    }

    open.onupgradeneeded = (event) => {
      const db = open.result;
      const from = event.oldVersion;
      syslog.info('storage', `migrating database ${from} -> ${DB_VERSION}`);

      if (!db.objectStoreNames.contains(STORE.fs)) {
        const fs = db.createObjectStore(STORE.fs, { keyPath: 'path' });
        // Directory listings are the hot path, so index the parent directory.
        fs.createIndex('parent', 'parent', { unique: false });
        fs.createIndex('mtime', 'mtime', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE.kv)) {
        db.createObjectStore(STORE.kv, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE.blobs)) {
        db.createObjectStore(STORE.blobs, { keyPath: 'id' });
      }
    };

    open.onsuccess = () => {
      const db = open.result;
      db.onversionchange = () => {
        syslog.warn('storage', 'database superseded by another tab - closing');
        db.close();
        dbPromise = null;
      };
      syslog.info('storage', `mounted ${DB_NAME} v${db.version}`);
      resolve(db);
    };

    open.onerror = () => {
      syslog.error('storage', `could not open database: ${String(open.error?.message)}`);
      resolve(null);
    };

    open.onblocked = () => {
      syslog.warn('storage', 'database open blocked by another tab');
    };
  });

  return dbPromise;
}

// --- memory fallback ---

const memory: Record<string, Map<IDBValidKey, unknown>> = {
  [STORE.fs]: new Map(),
  [STORE.kv]: new Map(),
  [STORE.blobs]: new Map(),
};

let usingMemory = false;

export function isVolatile(): boolean {
  return usingMemory;
}

// --- store operations ---

async function withStore<T>(
  name: StoreName,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openDatabase();

  if (!db) {
    usingMemory = true;
    return fn(memoryStoreShim(name) as unknown as IDBObjectStore);
  }

  return new Promise<T>((resolve, reject) => {
    let result: T;
    const tx = db.transaction(name, mode);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error('transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));

    fn(tx.objectStore(name)).then(
      (value) => {
        result = value;
      },
      (err) => {
        try {
          tx.abort();
        } catch {
          /* already finished */
        }
        reject(err);
      },
    );
  });
}

// Duck-typed stand-in for IDBObjectStore. Implements only what this module
// calls, and hands back fake requests that req() can await.
function memoryStoreShim(name: StoreName) {
  const map = memory[name];
  const fake = <T>(value: T) => {
    const r = { result: value, onsuccess: null as null | (() => void), onerror: null };
    queueMicrotask(() => r.onsuccess?.());
    return r as unknown as IDBRequest<T>;
  };

  return {
    get: (key: IDBValidKey) => fake(map.get(key)),
    put: (value: Record<string, unknown>) => {
      const keyField = name === STORE.fs ? 'path' : name === STORE.kv ? 'key' : 'id';
      map.set(value[keyField] as IDBValidKey, value);
      return fake(undefined);
    },
    delete: (key: IDBValidKey) => {
      map.delete(key);
      return fake(undefined);
    },
    clear: () => {
      map.clear();
      return fake(undefined);
    },
    getAll: () => fake([...map.values()]),
    getAllKeys: () => fake([...map.keys()]),
    count: () => fake(map.size),
  };
}

export async function putRecord(store: StoreName, value: unknown): Promise<void> {
  await withStore(store, 'readwrite', (s) => req(s.put(value as never)));
}

export async function putMany(store: StoreName, values: unknown[]): Promise<void> {
  await withStore(store, 'readwrite', async (s) => {
    for (const v of values) await req(s.put(v as never));
  });
}

export async function getRecord<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return withStore(store, 'readonly', (s) => req(s.get(key) as IDBRequest<T | undefined>));
}

export async function deleteRecord(store: StoreName, key: IDBValidKey): Promise<void> {
  await withStore(store, 'readwrite', (s) => req(s.delete(key)));
}

export async function allRecords<T>(store: StoreName): Promise<T[]> {
  return withStore(store, 'readonly', (s) => req(s.getAll() as IDBRequest<T[]>));
}

export async function allKeys(store: StoreName): Promise<IDBValidKey[]> {
  return withStore(store, 'readonly', (s) => req(s.getAllKeys()));
}

export async function countRecords(store: StoreName): Promise<number> {
  return withStore(store, 'readonly', (s) => req(s.count()));
}

export async function clearStore(store: StoreName): Promise<void> {
  await withStore(store, 'readwrite', (s) => req(s.clear()));
  syslog.warn('storage', `cleared store "${store}"`);
}

// --- typed key/value settings store ---

interface KVRow {
  key: string;
  value: unknown;
  at: number;
}

/**
 * Write-behind key/value store. A slider drag would otherwise issue a write per
 * frame, so writes are debounced and reads come from a synchronous cache.
 * `get` is safe to treat as instant once `hydrate()` has resolved.
 */
export class KVStore {
  private cache = new Map<string, unknown>();
  private dirty = new Set<string>();
  private flushTimer: number | null = null;
  private hydrated = false;

  constructor(private readonly debounceMs = 250) {}

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    const rows = await allRecords<KVRow>(STORE.kv);
    for (const row of rows) this.cache.set(row.key, row.value);
    this.hydrated = true;
    syslog.info('storage', `hydrated ${rows.length} settings`);
  }

  get<T>(key: string, fallback: T): T {
    if (!this.cache.has(key)) return fallback;
    const value = this.cache.get(key);
    return (value === undefined || value === null ? fallback : value) as T;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  set(key: string, value: unknown): void {
    this.cache.set(key, value);
    this.dirty.add(key);
    this.scheduleFlush();
  }

  delete(key: string): void {
    this.cache.delete(key);
    this.dirty.delete(key);
    void deleteRecord(STORE.kv, key);
  }

  keys(prefix = ''): string[] {
    return [...this.cache.keys()].filter((k) => k.startsWith(prefix)).sort();
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.debounceMs) as unknown as number;
  }

  async flush(): Promise<void> {
    if (this.dirty.size === 0) return;
    const rows: KVRow[] = [];
    for (const key of this.dirty) {
      rows.push({ key, value: this.cache.get(key), at: Date.now() });
    }
    this.dirty.clear();

    try {
      await putMany(STORE.kv, rows);
    } catch (err) {
      syslog.error('storage', `settings flush failed: ${String(err)}`);
      // Put the keys back so the next flush retries them.
      for (const row of rows) this.dirty.add(row.key);
    }
  }
}

export const settings = new KVStore();

// --- maintenance ---

export interface StorageReport {
  volatile: boolean;
  files: number;
  settings: number;
  blobs: number;
  quotaBytes: number | null;
  usedBytes: number | null;
}

/** Numbers for the Monitor storage panel. */
export async function storageReport(): Promise<StorageReport> {
  const [files, kv, blobs] = await Promise.all([
    countRecords(STORE.fs).catch(() => 0),
    countRecords(STORE.kv).catch(() => 0),
    countRecords(STORE.blobs).catch(() => 0),
  ]);

  let quotaBytes: number | null = null;
  let usedBytes: number | null = null;

  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      quotaBytes = est.quota ?? null;
      usedBytes = est.usage ?? null;
    } catch {
      /* estimate is best-effort */
    }
  }

  return { volatile: usingMemory, files, settings: kv, blobs, quotaBytes, usedBytes };
}

/** Wipes every store. Used by `sysreset` and by Settings. */
export async function wipeEverything(): Promise<void> {
  await Promise.all([clearStore(STORE.fs), clearStore(STORE.kv), clearStore(STORE.blobs)]);
  syslog.warn('storage', 'all persistent state destroyed');
}

/** Lands pending settings writes before the tab goes away. */
export function installUnloadFlush(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('pagehide', () => {
    void settings.flush();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void settings.flush();
  });
}