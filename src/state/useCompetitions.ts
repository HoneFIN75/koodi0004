import { useEffect, useMemo, useState } from 'react';
import type { MunicipalityDataset, Region } from '../models/region';
import type { CompetitionDataset } from '../models/competition';
import { competitionRepository } from '../data/competitionRepository';
import { analyzeCompetitions, filterCompetitions } from '../services/competitionService';
import { useCompetitionStore } from './competitionStore';
import { createCompetitionScopeLookup } from '../services/competitionScopeService';

export function useCompetitions(municipalities: MunicipalityDataset | null, regions: Region[]) {
  const [data, setData] = useState<CompetitionDataset | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const { filters, selectedId, setFilters, select, reset } = useCompetitionStore();
  useEffect(() => {
    let active = true;
    if (!municipalities) return;
    setError('');
    competitionRepository.getCompetitions(municipalities).then((result) => { if (active) setData(result); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Kilpailuaineiston lataaminen epäonnistui.'); });
    return () => { active = false; };
  }, [municipalities, attempt]);
  const competitions = useMemo(() => data ? filterCompetitions(data, filters, regions) : [], [data, filters, regions]);
  const analysis = useMemo(() => data && municipalities ? analyzeCompetitions(competitions, municipalities, regions) : null, [data, competitions, municipalities, regions]);
  const selected = useMemo(() => selectedId ? competitions.find((item) => item.id === selectedId) ?? null : null, [competitions, selectedId]);
  const scopeFor = useMemo(() => data && municipalities ? createCompetitionScopeLookup(competitions, municipalities) : null, [data, competitions, municipalities]);
  return { data, error, retry: () => setAttempt((value) => value + 1), filters, setFilters, reset, competitions, analysis, selected, select, regions, municipalities, scopeFor };
}

export type CompetitionContext = ReturnType<typeof useCompetitions>;
