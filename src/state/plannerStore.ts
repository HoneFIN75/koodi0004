import { createStore } from 'zustand/vanilla';
import type { PlannerDocument, SaveStatus, Snapshot } from '../models/region';
import { addSnapshot, shouldAutoBackup } from '../services/backupService.ts';
import { createHistory, pushHistory, redoHistory, replacePresent, undoHistory, type History } from '../services/historyService.ts';
import { createStorage, loadBackups, loadDocument, saveBackups, saveDocument, type StorageAdapter } from '../services/persistenceService.ts';
import { createDocument, normalizeDocument } from '../services/plannerDocument.ts';

export interface PlannerState {
  ready: boolean;
  loadError: string | null;
  history: History<PlannerDocument>;
  saveStatus: SaveStatus;
  lastSavedAt: string | null;
  storageKind: StorageAdapter['kind'] | null;
  backups: Snapshot[];
  init: () => Promise<void>;
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

export function createPlannerStore({ storage = () => createStorage(), debounceMs = 400 }: PlannerStoreOptions = {}) {
  let adapter: StorageAdapter | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let initializing: Promise<void> | null = null;

  const store = createStore<PlannerState>()((set, get) => {
    const persistBackups = async (backups: Snapshot[]) => {
      set({ backups });
      if (adapter) await saveBackups(adapter, backups);
    };

    const flush = async () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!adapter) return;
      const document = get().history.present;
      set({ saveStatus: 'saving' });
      try {
        await saveDocument(adapter, document);
        if (shouldAutoBackup(get().backups)) await persistBackups(addSnapshot(get().backups, document, 'Automaattinen varmuuskopio'));
        if (get().history.present === document) set({ saveStatus: 'saved', lastSavedAt: new Date().toISOString() });
      } catch {
        set({ saveStatus: 'error' });
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
      backups: [],
      init: () => {
        initializing ??= (async () => {
          try {
            adapter = await storage();
            const [stored, backups] = await Promise.all([loadDocument(adapter), loadBackups(adapter)]);
            const document = normalizeDocument(stored);
            const validBackups = (Array.isArray(backups) ? backups : []).flatMap((backup) => {
              const restored = normalizeDocument(backup?.document);
              return restored && typeof backup.createdAt === 'string' ? [{ ...backup, document: restored }] : [];
            });
            set({ ready: true, history: createHistory(document ?? createDocument()), backups: validBackups, storageKind: adapter.kind, lastSavedAt: document ? new Date().toISOString() : null });
            if (!document) await flush();
          } catch (error) {
            set({ ready: true, loadError: error instanceof Error ? error.message : 'Tallennustilaa ei voitu avata.' });
          }
        })();
        return initializing;
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
