import { create } from 'zustand';
import type { CompetitionFilters } from '../models/competition';

export const defaultCompetitionFilters: CompetitionFilters = {
  visibility: 'hidden', years: [], query: '', model: '', tier: '', organizer: '', municipality: '', regionId: '',
};

export const useCompetitionStore = create<{
  filters: CompetitionFilters;
  selectedId: string | null;
  setFilters: (changes: Partial<CompetitionFilters>) => void;
  select: (id: string | null) => void;
  reset: () => void;
}>((set) => ({
  filters: defaultCompetitionFilters,
  selectedId: null,
  setFilters: (changes) => set((state) => ({ filters: { ...state.filters, ...changes }, selectedId: null })),
  select: (selectedId) => set({ selectedId }),
  reset: () => set({ filters: { ...defaultCompetitionFilters, years: [] }, selectedId: null }),
}));
