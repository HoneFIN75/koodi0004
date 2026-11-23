import { useMemo } from 'react';
import { useStore } from 'zustand';
import { competitionStore } from './competitionStore';
import { getCompetitionStatistics } from '../services/competitionService';
import type { CompetitionScope } from '../models/competition';
import type { Municipality } from '../models/region';

const noGeography: readonly Municipality[] = [];

export const useCompetitionData = () => useStore(competitionStore);

export function useCompetitionStatistics(scope: CompetitionScope = {}, geography: readonly Municipality[] = noGeography) {
  const { index, yearFilter } = useCompetitionData();
  const { municipality, municipalityNames } = scope;
  return useMemo(() => index ? getCompetitionStatistics(index, yearFilter, { municipality, municipalityNames }, geography) : null,
    [index, yearFilter, municipality, municipalityNames, geography]);
}
