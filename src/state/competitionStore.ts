import { createStore } from 'zustand/vanilla';
import type { CompetitionIndex, YearFilter } from '../models/competition.ts';
import { competitionRepository } from '../data/competitionRepository.ts';
import { validateYearFilter } from '../services/competitionService.ts';

interface CompetitionState {
  index: CompetitionIndex | null;
  yearFilter: YearFilter;
  refreshing: boolean;
  error: string;
  updatedAt: string | null;
  setYearFilter: (filter: YearFilter) => void;
}

export const competitionStore = createStore<CompetitionState>((set) => ({
  index: null, yearFilter: { mode: 'all' }, refreshing: false, error: '', updatedAt: null,
  setYearFilter(filter) {
    validateYearFilter(filter);
    set({ yearFilter: filter });
  },
}));

let pending: Promise<void> | null = null;
let controller: AbortController | null = null;

export function refreshCompetitions(): Promise<void> {
  if (pending) return pending;
  const request = new AbortController();
  controller = request;
  competitionStore.setState({ refreshing: true });
  pending = competitionRepository.getIndex(request.signal).then((index) => {
    if (request.signal.aborted) return;
    competitionStore.setState({ index, error: '', updatedAt: new Date().toISOString() });
  }).catch((cause: unknown) => {
    if (request.signal.aborted) return;
    competitionStore.setState({ error: cause instanceof Error ? cause.message : 'Kilpailuaineiston lataus epäonnistui.' });
  }).finally(() => {
    if (controller !== request) return;
    controller = null; pending = null;
    competitionStore.setState({ refreshing: false });
  });
  return pending;
}

export function startCompetitionRefresh(): () => void {
  void refreshCompetitions();
  const refreshVisible = () => { if (document.visibilityState === 'visible') void refreshCompetitions(); };
  const timer = window.setInterval(refreshVisible, 60_000);
  window.addEventListener('focus', refreshVisible);
  document.addEventListener('visibilitychange', refreshVisible);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener('focus', refreshVisible);
    document.removeEventListener('visibilitychange', refreshVisible);
    controller?.abort(); controller = null; pending = null;
    competitionStore.setState({ refreshing: false });
  };
}
