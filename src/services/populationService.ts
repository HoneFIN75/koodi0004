import populationData from '../data/municipalities-population-2025.json' with { type: 'json' };
import municipalityNames from '../data/municipality-names.json' with { type: 'json' };
import type { Municipality, MunicipalityDataset, PlannerDocument, Region } from '../models/region';

export const populationCategories = [
  { id: 'mega', label: 'Suurkaupunki', english: 'Mega City', min: 200000, color: '#581c87' },
  { id: 'large-city', label: 'Suuri kaupunki', english: 'Large City', min: 100000, color: '#7e22ce' },
  { id: 'medium-city', label: 'Keskisuuri kaupunki', english: 'Medium City', min: 50000, color: '#a21caf' },
  { id: 'small-city', label: 'Pieni kaupunki', english: 'Small City', min: 20000, color: '#be123c' },
  { id: 'large-municipality', label: 'Suuri kunta', english: 'Large Municipality', min: 10000, color: '#c2410c' },
  { id: 'municipality', label: 'Kunta', english: 'Municipality', min: 5000, color: '#a16207' },
  { id: 'small-municipality', label: 'Pieni kunta', english: 'Small Municipality', min: 2000, color: '#15803d' },
  { id: 'very-small', label: 'Hyvin pieni kunta', english: 'Very Small Municipality', min: 0, color: '#0369a1' },
] as const;

export type PopulationCategory = typeof populationCategories[number]['id'];
export interface PopulationRecord { name: string; population: number }
export interface PopulationFilters {
  minPopulation?: number | null;
  maxPopulation?: number | null;
  populationCategory?: PopulationCategory | '';
}
export const normalizeMunicipalityName = (name: string) => name.normalize('NFC').toLocaleLowerCase('fi-FI').replace(/\s+/g, ' ').trim();

export const per10000Residents = (count: number | null, population: number | null): number | null =>
  count !== null && population !== null && population > 0 ? count / population * 10000 : null;

export function getPopulationCategory(population: number | null) {
  return population !== null && Number.isSafeInteger(population) && population >= 0
    ? populationCategories.find((category) => population >= category.min) ?? null
    : null;
}

export function matchesPopulation(population: number | null, filters: PopulationFilters): boolean {
  const active = filters.minPopulation != null || filters.maxPopulation != null || Boolean(filters.populationCategory);
  if (!active) return true;
  if (population === null) return false;
  return (filters.minPopulation == null || population >= filters.minPopulation)
    && (filters.maxPopulation == null || population <= filters.maxPopulation)
    && (!filters.populationCategory || getPopulationCategory(population)?.id === filters.populationCategory);
}

export function summarizePopulation<T extends PopulationRecord | Municipality>(municipalities: readonly T[]) {
  const unique = [...new Map(municipalities.map((item) => [normalizeMunicipalityName(item.name), item])).values()];
  const known = unique.filter((item) => item.population !== null);
  const sorted = [...known].sort((a, b) => (b.population ?? 0) - (a.population ?? 0) || a.name.localeCompare(b.name, 'fi'));
  const sum = known.reduce((total, item) => total + (item.population ?? 0), 0);
  const middle = Math.floor(sorted.length / 2);
  return {
    total: unique.length === known.length ? sum : null,
    knownTotal: sum,
    missing: unique.filter((item) => item.population === null).map((item) => item.name),
    average: known.length ? sum / known.length : null,
    median: sorted.length ? ((sorted[middle]?.population ?? 0) + (sorted[Math.floor((sorted.length - 1) / 2)]?.population ?? 0)) / 2 : null,
    largest: sorted[0] ?? null,
    smallest: sorted[sorted.length - 1] ?? null,
    sorted,
  };
}

export function createPopulationService(input: unknown) {
  if (typeof input !== 'object' || input === null || !('municipalities' in input) || !Array.isArray(input.municipalities)
      || !('metadata' in input) || typeof input.metadata !== 'object' || input.metadata === null
      || !('populationYear' in input.metadata) || input.metadata.populationYear !== 2025) {
    throw new Error('Vuoden 2025 väestöaineiston rakenne on virheellinen.');
  }
  const byName = new Map<string, PopulationRecord>();
  const warnings: string[] = [];
  for (const row of input.municipalities) {
    if (typeof row !== 'object' || row === null || !('name' in row) || typeof row.name !== 'string' || !row.name.trim()
        || !('population' in row) || typeof row.population !== 'number' || !Number.isSafeInteger(row.population) || row.population < 0) {
      warnings.push('Väestöaineiston virheellinen kuntarivi ohitettiin.');
      continue;
    }
    const key = normalizeMunicipalityName(row.name);
    if (byName.has(key)) {
      warnings.push(`Väestöaineiston kuntanimi esiintyy useasti: ${row.name}.`);
      continue;
    }
    byName.set(key, { name: row.name.trim(), population: row.population });
  }
  if (!byName.size) throw new Error('Väestöaineistossa ei ole kelvollisia kuntia.');
  if (!('municipalityCount' in input.metadata) || input.metadata.municipalityCount !== byName.size) {
    warnings.push('Väestöaineiston kuntamäärä ei vastaa metadataa.');
  }
  const sorted = [...byName.values()].sort((a, b) => b.population - a.population || a.name.localeCompare(b.name, 'fi'));
  const ranks = new Map<string, number>();
  let rank = 0;
  sorted.forEach((item, index) => {
    if (index === 0 || item.population !== sorted[index - 1].population) rank = index + 1;
    ranks.set(item.name, rank);
  });
  const nationalPopulation = sorted.reduce((sum, item) => sum + item.population, 0);
  const ascending = [...sorted].reverse();
  for (const record of sorted) {
    for (const name of record.name.split(' - ')) {
      const key = normalizeMunicipalityName(name);
      if (!byName.has(key)) byName.set(key, record);
    }
  }
  const getMunicipalityByName = (name: string) => byName.get(normalizeMunicipalityName(name)) ?? null;
  const registerNames = (municipalities: readonly Pick<Municipality, 'name' | 'nameSv'>[]) => {
    for (const municipality of municipalities) {
      const record = getMunicipalityByName(municipality.name) ?? (municipality.nameSv ? getMunicipalityByName(municipality.nameSv) : null);
      if (!record) continue;
      for (const alias of [municipality.name, municipality.nameSv]) {
        if (alias) byName.set(normalizeMunicipalityName(alias), record);
      }
    }
  };
  return {
    year: 2025,
    warnings,
    municipalities: sorted,
    registerNames,
    getMunicipalityByName,
    getMunicipalityPopulation: (name: string) => getMunicipalityByName(name)?.population ?? null,
    getMunicipalityRank: (name: string) => {
      const record = getMunicipalityByName(name);
      return record ? ranks.get(record.name) ?? null : null;
    },
    getNationalPopulation: () => nationalPopulation,
    getLargestMunicipalities: (count: number) => sorted.slice(0, Math.max(0, Math.floor(count))),
    getSmallestMunicipalities: (count: number) => ascending.slice(0, Math.max(0, Math.floor(count))),
    getRegionPopulation: (regionId: string, document: PlannerDocument, dataset: MunicipalityDataset) => {
      const region = document.scenarios.find((item) => item.id === document.activeScenarioId)?.regions.find((item) => item.id === regionId);
      if (!region) return null;
      const municipalities = [...new Set(region.municipalityCodes)].map((code) => dataset.byCode.get(code));
      if (municipalities.some((item) => !item)) return null;
      return summarizePopulation(municipalities.filter((item): item is Municipality => Boolean(item))).total;
    },
  };
}

// Static module import and singleton processing: all consumers share one dataset.
export const populationService = createPopulationService(populationData);
populationService.registerNames(municipalityNames);
export const { getMunicipalityPopulation, getMunicipalityByName, getMunicipalityRank, getNationalPopulation, getLargestMunicipalities, getSmallestMunicipalities, getRegionPopulation } = populationService;

const datasetSummaries = new WeakMap<MunicipalityDataset, ReturnType<typeof summarizePopulation<Municipality>>>();
export function getDatasetPopulation(dataset: MunicipalityDataset) {
  let summary = datasetSummaries.get(dataset);
  if (!summary) {
    summary = summarizePopulation(dataset.municipalities);
    datasetSummaries.set(dataset, summary);
  }
  return summary;
}

export function getCoveragePopulation(regions: readonly Region[], dataset: MunicipalityDataset): number | null {
  const codes = [...new Set(regions.filter((region) => region.enabled).flatMap((region) => region.municipalityCodes))];
  const municipalities = codes.map((code) => dataset.byCode.get(code));
  if (municipalities.some((item) => !item)) return null;
  return summarizePopulation(municipalities.filter((item): item is Municipality => Boolean(item))).total;
}
