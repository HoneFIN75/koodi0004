import type { Competition } from '../models/competition.ts';
import type { MunicipalityDataset } from '../models/region.ts';
import { analyzeCompetitions, getPrimaryMunicipality } from './competitionService.ts';
import { summarizePopulation } from './populationService.ts';

export function createCompetitionScopeLookup(competitions: readonly Competition[], dataset: MunicipalityDataset) {
  const primaryIndex = new Map<string, Competition[]>();
  const associatedIndex = new Map<string, Competition[]>();
  const add = (index: Map<string, Competition[]>, code: string, competition: Competition) => {
    const entries = index.get(code) ?? []; entries.push(competition); index.set(code, entries);
  };
  for (const competition of competitions) {
    const primary = getPrimaryMunicipality(competition)?.municipalityCode;
    if (primary) add(primaryIndex, primary, competition);
    for (const code of new Set(competition.municipalities.flatMap((item) => item.municipalityCode ? [item.municipalityCode] : []))) add(associatedIndex, code, competition);
  }
  const calculate = (codes: string[]) => {
    const union = (index: Map<string, Competition[]>) => [...new Map(codes.flatMap((code) => (index.get(code) ?? []).map((competition) => [competition.id, competition] as const))).values()];
    const primary = union(primaryIndex);
    const associated = union(associatedIndex);
    const population = codes.every((code) => dataset.byCode.has(code)) ? summarizePopulation(codes.map((code) => dataset.byCode.get(code)!)).total : null;
    return { primary, associated, population, coverage: analyzeCompetitions(associated, dataset) };
  };
  const cache = new Map<string, ReturnType<typeof calculate>>();
  return (codes: readonly string[]) => {
    const unique = [...new Set(codes)].sort();
    const key = unique.join(',');
    let result = cache.get(key);
    if (!result) { result = calculate(unique); cache.set(key, result); }
    return result;
  };
}
