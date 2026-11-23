import { createStore } from 'zustand/vanilla';
import type { PlannerDocument, SaveStatus, Snapshot } from '../models/region';
import { addSnapshot, shouldAutoBackup } from '../services/backupService.ts';
import { createHistory, pushHistory, redoHistory, replacePresent, undoHistory, type History } from '../services/historyService.ts';
import { createRemoteStorage, createStorage, loadBackups, loadDocument, RemoteStorageError, saveBackups, saveDocument, type RemoteStorageAdapter, type StorageAdapter } from '../services/persistenceService.ts';
import { createDocument, normalizeDocument } from '../services/plannerDocument.ts';

export interface PlannerState {
  ready: boolean;
  loadError: string | null;
  history: History<PlannerDocument>;
  saveStatus: SaveStatus;
  lastSavedAt: string | null;
  storageKind: StorageAdapter['kind'] | null;
  remoteMode: boolean;
  migrationAvailable: boolean;
  authRequired: boolean;
  writeConflict: boolean;
  saveError: string | null;
  backups: Snapshot[];
  init: () => Promise<void>;
  retryInit: () => Promise<void>;
  setCsrfToken: (token: string) => void;
  migrateLocalData: () => Promise<void>;
  startEmpty: () => Promise<void>;
  reloadRemote: () => Promise<void>;
  commit: (label: string, update: (document: PlannerDocument) => PlannerDocument, coalesceKey?: string) => void;
  navigate: (update: (document: PlannerDocument) => PlannerDocument) => void;
  undo: () => void;
  redo: () => void;
  createBackup: (reason: string) => Promise<void>;
  restoreBackup: (id: string) => Promise<void>;
  flush: () => Promise<void>;
}

export interface PlannerStoreOptions {
  storage?: () => Promise<StorageAdapter>;
  debounceMs?: number;
}

function isRemoteStorage(adapter: StorageAdapter | null): adapter is RemoteStorageAdapter {
  return adapter?.kind === 'Palvelin';
}

export function createPlannerStore({ storage = async () => import.meta.env.PROD ? createRemoteStorage() : createStorage(), debounceMs = 400 }: PlannerStoreOptions = {}) {
  let adapter: StorageAdapter | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let initializing: Promise<void> | null = null;

  const store = createStore<PlannerState>()((set, get) => {
    const persistBackups = async (backups: Snapshot[]) => {
      set({ backups });
      if (adapter) {
        try {
          await saveBackups(adapter, backups);
        } catch (error) {
          set({
            saveStatus: 'error',
            authRequired: error instanceof RemoteStorageError && error.status === 401,
            writeConflict: error instanceof RemoteStorageError && error.status === 409,
            saveError: error instanceof Error ? error.message : 'Tallennus epäonnistui.',
          });
          throw error;
        }
      }
    };

    const flush = async () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!adapter) return;
      if (get().migrationAvailable) { set({ saveStatus: 'unsaved' }); return; }
      const document = get().history.present;
      set({ saveStatus: 'saving' });
      try {
        await saveDocument(adapter, document);
        if (shouldAutoBackup(get().backups)) await persistBackups(addSnapshot(get().backups, document, 'Automaattinen varmuuskopio'));
        if (get().history.present === document) set({ saveStatus: 'saved', lastSavedAt: new Date().toISOString(), authRequired: false, writeConflict: false, saveError: null });
      } catch (error) {
        set({
          saveStatus: 'error',
          authRequired: error instanceof RemoteStorageError && error.status === 401,
          writeConflict: error instanceof RemoteStorageError && error.status === 409,
          saveError: error instanceof Error ? error.message : 'Tallennus epäonnistui.',
        });
      }
    };

    const scheduleSave = () => {
      set({ saveStatus: 'unsaved' });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void flush(); }, debounceMs);
    };

    const setHistory = (history: History<PlannerDocument>) => {
      if (history === get().history) return;
      set({ history });
      scheduleSave();
    };

    return {
      ready: false,
      loadError: null,
      history: createHistory(createDocument()),
      saveStatus: 'saved',
      lastSavedAt: null,
      storageKind: null,
      remoteMode: false,
      migrationAvailable: false,
      authRequired: false,
      writeConflict: false,
      saveError: null,
      backups: [],
      init: () => {
        initializing ??= (async () => {
          try {
            adapter = await storage();
            const [stored, backups] = await Promise.all([loadDocument(adapter), loadBackups(adapter)]);
            const document = normalizeDocument(stored);
            if (adapter.kind === 'Palvelin' && stored !== null && !document) throw new Error('Palvelimella oleva suunnitelma ei ole kelvollinen. Sitä ei ylikirjoitettu.');
            const validBackups = (Array.isArray(backups) ? backups : []).flatMap((backup) => {
              const restored = normalizeDocument(backup?.document);
              return restored && typeof backup.createdAt === 'string' ? [{ ...backup, document: restored }] : [];
            });
            const remoteMode = adapter.kind === 'Palvelin';
            if (remoteMode && !document) {
              const legacy = await createStorage();
              const legacyDocument = normalizeDocument(await loadDocument(legacy));
              if (legacyDocument) {
                set({ ready: true, history: createHistory(legacyDocument), backups: validBackups, storageKind: adapter.kind, remoteMode, migrationAvailable: true, saveStatus: 'unsaved', lastSavedAt: null });
                return;
              }
            }
            set({
              ready: true,
              history: createHistory(document ?? createDocument()),
              backups: validBackups,
              storageKind: adapter.kind,
              remoteMode,
              migrationAvailable: false,
              saveStatus: remoteMode && !document ? 'unsaved' : 'saved',
              lastSavedAt: document ? new Date().toISOString() : null,
            });
            if (!document && !remoteMode) await flush();
          } catch (error) {
            set({ ready: true, remoteMode: adapter?.kind === 'Palvelin', loadError: error instanceof Error ? error.message : 'Tallennustilaa ei voitu avata.' });
          }
        })();
        return initializing;
      },
      retryInit: async () => {
        initializing = null;
        adapter = null;
        set({ ready: false, loadError: null });
        await get().init();
      },
      setCsrfToken: (token) => {
        if (isRemoteStorage(adapter)) adapter.setCsrfToken(token);
      },
      migrateLocalData: async () => {
        if (!isRemoteStorage(adapter) || !get().migrationAvailable) return;
        const legacy = await createStorage();
        const document = normalizeDocument(await loadDocument(legacy));
        if (!document) throw new Error('Selaimesta ei löytynyt siirrettävää suunnitelmaa.');
        const oldBackups = await loadBackups(legacy);
        const backups = oldBackups.flatMap((backup) => {
          const restored = normalizeDocument(backup?.document);
          return restored && typeof backup.createdAt === 'string' ? [{ ...backup, document: restored }] : [];
        });
        try {
          await adapter.migrate(document, backups);
        } catch (error) {
          set({
            authRequired: error instanceof RemoteStorageError && error.status === 401,
            writeConflict: error instanceof RemoteStorageError && error.status === 409,
            saveError: error instanceof Error ? error.message : 'Selaimen suunnitelmaa ei voitu siirtää.',
          });
          throw error;
        }
        set({ history: createHistory(document), backups, migrationAvailable: false, saveStatus: 'saved', lastSavedAt: new Date().toISOString(), authRequired: false, writeConflict: false, saveError: null });
      },
      startEmpty: async () => {
        if (!isRemoteStorage(adapter) || !get().migrationAvailable) return;
        const document = createDocument();
        try {
          await adapter.startEmpty(document);
        } catch (error) {
          set({
            authRequired: error instanceof RemoteStorageError && error.status === 401,
            writeConflict: error instanceof RemoteStorageError && error.status === 409,
            saveError: error instanceof Error ? error.message : 'Tyhjää suunnitelmaa ei voitu luoda palvelimelle.',
          });
          throw error;
        }
        set({ history: createHistory(document), backups: [], migrationAvailable: false, saveStatus: 'saved', lastSavedAt: new Date().toISOString(), authRequired: false, writeConflict: false, saveError: null });
      },
      reloadRemote: async () => {
        if (!isRemoteStorage(adapter)) return;
        const result = await adapter.reload();
        const document = normalizeDocument(result.document);
        if (!document) throw new Error('Palvelimelta ei löytynyt kelvollista suunnitelmaa.');
        const backups = result.backups.flatMap((backup) => {
          const restored = normalizeDocument(backup?.document);
          return restored && typeof backup.createdAt === 'string' ? [{ ...backup, document: restored }] : [];
        });
        set({ history: createHistory(document), backups, migrationAvailable: false, saveStatus: 'saved', lastSavedAt: new Date().toISOString(), authRequired: false, writeConflict: false, saveError: null });
      },
      commit: (label, update, coalesceKey) => {
        const { history } = get();
        const next = update(history.present);
        if (next !== history.present) setHistory(pushHistory(history, next, label, coalesceKey ?? null));
      },
      navigate: (update) => {
        const { history } = get();
        const next = update(history.present);
        if (next !== history.present) setHistory(replacePresent(history, next));
      },
      undo: () => setHistory(undoHistory(get().history)),
      redo: () => setHistory(redoHistory(get().history)),
      createBackup: async (reason) => persistBackups(addSnapshot(get().backups, get().history.present, reason)),
      restoreBackup: async (id) => {
        const snapshot = get().backups.find((backup) => backup.id === id);
        if (!snapshot) return;
        await persistBackups(addSnapshot(get().backups, get().history.present, 'Ennen palautusta'));
        get().commit(`Palautus: ${new Date(snapshot.createdAt).toLocaleString('fi-FI')}`, () => structuredClone(snapshot.document));
      },
      flush,
    };
  });
  return store;
}

export const plannerStore = createPlannerStore();
