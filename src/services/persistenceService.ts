import type { PlannerDocument, Snapshot } from '../models/region';

export const STORAGE_KEYS = { document: 'region-planner:document', backups: 'region-planner:backups' } as const;

export interface StorageAdapter {
  readonly kind: 'IndexedDB' | 'LocalStorage' | 'Muisti' | 'Palvelin';
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}

export interface RemoteStorageAdapter extends StorageAdapter {
  readonly kind: 'Palvelin';
  readonly remote: true;
  setCsrfToken(token: string): void;
  migrate(document: PlannerDocument, backups: Snapshot[]): Promise<void>;
  startEmpty(document: PlannerDocument): Promise<void>;
  reload(): Promise<{ document: PlannerDocument | null; backups: Snapshot[] }>;
}

interface RemoteState {
  document: PlannerDocument | null;
  backups: Snapshot[];
  revision: string | null;
}

export class RemoteStorageError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'RemoteStorageError';
    this.status = status;
  }
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

export function createRemoteStorage(url = `${import.meta.env.BASE_URL}api/planner.php`): RemoteStorageAdapter {
  let state: RemoteState | null = null;
  let csrfToken = '';
  let writeQueue: Promise<void> = Promise.resolve();

  const request = async (method: 'GET' | 'PUT', payload?: Omit<RemoteState, 'revision'>, expectedRevision?: string | null) => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (method === 'PUT') {
      headers['Content-Type'] = 'application/json';
      headers['X-CSRF-Token'] = csrfToken;
      if (expectedRevision === null) headers['If-None-Match'] = '*';
      else if (expectedRevision !== undefined) headers['X-Expected-Revision'] = expectedRevision;
    }
    const response = await fetch(url, { method, headers, credentials: 'same-origin', ...(payload ? { body: JSON.stringify(payload) } : {}) });
    const result = await response.json().catch(() => null) as { error?: string; document?: PlannerDocument | null; backups?: Snapshot[]; revision?: string | null } | null;
    if (!response.ok) throw new RemoteStorageError(result?.error ?? `Palvelimen tallennus epäonnistui (${response.status}).`, response.status);
    if (!result || typeof result !== 'object'
      || (method === 'GET' && (!Object.hasOwn(result, 'document') || !Array.isArray(result.backups) || !(typeof result.revision === 'string' || result.revision === null)))
      || (method === 'PUT' && typeof result.revision !== 'string')) {
      throw new RemoteStorageError('Palvelin ei vastannut tallennusrajapinnan kelvollisessa muodossa. Tarkista PHP-rajapinnan käyttöönotto.', 502);
    }
    return result;
  };

  const load = async () => {
    if (!state) {
      const result = await request('GET');
      state = { document: result?.document ?? null, backups: result?.backups ?? [], revision: result?.revision ?? null };
    }
    return state;
  };

  const persist = async () => {
    const current = await load();
    const result = await request('PUT', { document: current.document, backups: current.backups }, current.revision);
    current.revision = result?.revision ?? null;
  };

  const queuePersist = () => {
    writeQueue = writeQueue.then(persist, persist);
    return writeQueue;
  };

  const importIfEmpty = async (document: PlannerDocument, backups: Snapshot[]) => {
    const current = await load();
    if (current.revision !== null || current.document !== null) {
      throw new RemoteStorageError('Palvelimella on jo suunnitelma. Paikallisia tietoja ei siirretty.', 409);
    }
    const next = { document, backups };
    const create = async () => {
      const result = await request('PUT', next, null);
      state = { ...next, revision: result?.revision ?? null };
    };
    writeQueue = writeQueue.then(create, create);
    await writeQueue;
  };

  return {
    kind: 'Palvelin',
    remote: true,
    setCsrfToken(token) { csrfToken = token; },
    async get<T>(key: string) {
      const current = await load();
      return (key === STORAGE_KEYS.document ? current.document : key === STORAGE_KEYS.backups ? current.backups : null) as T | null;
    },
    async set<T>(key: string, value: T) {
      const current = await load();
      if (key === STORAGE_KEYS.document) current.document = value as PlannerDocument;
      else if (key === STORAGE_KEYS.backups) current.backups = value as Snapshot[];
      else throw new Error(`Tuntematon tallennusavain: ${key}`);
      await queuePersist();
    },
    migrate: importIfEmpty,
    startEmpty: (document) => importIfEmpty(document, []),
    async reload() {
      state = null;
      const current = await load();
      return { document: current.document, backups: current.backups };
    },
  };
}

export const loadDocument = (adapter: StorageAdapter) => adapter.get<PlannerDocument>(STORAGE_KEYS.document);
export const saveDocument = (adapter: StorageAdapter, document: PlannerDocument) => adapter.set(STORAGE_KEYS.document, document);
export const loadBackups = async (adapter: StorageAdapter) => (await adapter.get<Snapshot[]>(STORAGE_KEYS.backups)) ?? [];
export const saveBackups = (adapter: StorageAdapter, backups: Snapshot[]) => adapter.set(STORAGE_KEYS.backups, backups);
