import type { PlannerDocument, Snapshot } from '../models/region';

export const STORAGE_KEYS = { document: 'region-planner:document', backups: 'region-planner:backups' } as const;

export interface StorageAdapter {
  readonly kind: 'IndexedDB' | 'LocalStorage' | 'Muisti';
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}

const DB_NAME = 'koodi0004-region-planner';
const STORE = 'kv';

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function createIndexedDbAdapter(factory: IDBFactory): Promise<StorageAdapter> {
  const open = factory.open(DB_NAME, 1);
  open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE); };
  const db = await requestToPromise(open);
  const run = <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  return {
    kind: 'IndexedDB',
    async get<T>(key: string) { return (await run('readonly', (store) => store.get(key)) as T | undefined) ?? null; },
    async set<T>(key: string, value: T) { await run('readwrite', (store) => store.put(value, key)); },
  };
}

export function createLocalStorageAdapter(storage: Storage): StorageAdapter {
  return {
    kind: 'LocalStorage',
    async get<T>(key: string) {
      const raw = storage.getItem(key);
      return raw === null ? null : JSON.parse(raw) as T;
    },
    async set<T>(key: string, value: T) { storage.setItem(key, JSON.stringify(value)); },
  };
}

export function createMemoryAdapter(): StorageAdapter {
  const values = new Map<string, string>();
  return {
    kind: 'Muisti',
    async get<T>(key: string) { const raw = values.get(key); return raw === undefined ? null : JSON.parse(raw) as T; },
    async set<T>(key: string, value: T) { values.set(key, JSON.stringify(value)); },
  };
}

function usableLocalStorage(storage: Storage | undefined): Storage | null {
  try {
    if (!storage) return null;
    storage.setItem('region-planner:probe', '1');
    storage.removeItem('region-planner:probe');
    return storage;
  } catch {
    return null;
  }
}

/** IndexedDB first, LocalStorage as fallback, in-memory storage as the last resort (e.g. private mode). */
export async function createStorage(env: { indexedDB?: IDBFactory; localStorage?: Storage } = globalThis): Promise<StorageAdapter> {
  if (env.indexedDB) {
    try { return await createIndexedDbAdapter(env.indexedDB); } catch { /* fall through */ }
  }
  const local = usableLocalStorage(env.localStorage);
  return local ? createLocalStorageAdapter(local) : createMemoryAdapter();
}

export const loadDocument = (adapter: StorageAdapter) => adapter.get<PlannerDocument>(STORAGE_KEYS.document);
export const saveDocument = (adapter: StorageAdapter, document: PlannerDocument) => adapter.set(STORAGE_KEYS.document, document);
export const loadBackups = async (adapter: StorageAdapter) => (await adapter.get<Snapshot[]>(STORAGE_KEYS.backups)) ?? [];
export const saveBackups = (adapter: StorageAdapter, backups: Snapshot[]) => adapter.set(STORAGE_KEYS.backups, backups);
