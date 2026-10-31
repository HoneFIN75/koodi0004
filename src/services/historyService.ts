export const HISTORY_LIMIT = 100;
const COALESCE_WINDOW_MS = 800;

export interface HistoryEntry<T> {
  state: T;
  label: string;
}

export interface History<T> {
  past: HistoryEntry<T>[];
  present: T;
  future: HistoryEntry<T>[];
  lastKey: string | null;
  lastAt: number;
}

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastKey: null, lastAt: 0 };
}

/**
 * Records a new state. Consecutive changes with the same coalesce key (e.g. dragging an opacity slider)
 * within a short window collapse into one undo step.
 */
export function pushHistory<T>(history: History<T>, next: T, label: string, coalesceKey: string | null = null, at = Date.now(), limit = HISTORY_LIMIT): History<T> {
  if (Object.is(next, history.present)) return history;
  if (coalesceKey !== null && coalesceKey === history.lastKey && at - history.lastAt < COALESCE_WINDOW_MS) {
    return { ...history, present: next, future: [], lastAt: at };
  }
  const past = [...history.past, { state: history.present, label }];
  return { past: past.slice(Math.max(0, past.length - limit)), present: next, future: [], lastKey: coalesceKey, lastAt: at };
}

export function undoHistory<T>(history: History<T>): History<T> {
  const previous = history.past[history.past.length - 1];
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1), present: previous.state, future: [{ state: history.present, label: previous.label }, ...history.future], lastKey: null, lastAt: 0,
  };
}

export function redoHistory<T>(history: History<T>): History<T> {
  const [next, ...future] = history.future;
  if (!next) return history;
  return { past: [...history.past, { state: history.present, label: next.label }], present: next.state, future, lastKey: null, lastAt: 0 };
}

/** Replaces the present without creating an undo step (navigation such as switching scenario). */
export function replacePresent<T>(history: History<T>, next: T): History<T> {
  return { ...history, present: next, lastKey: null };
}
