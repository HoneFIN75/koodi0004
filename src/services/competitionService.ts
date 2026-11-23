import type { Competition, CompetitionIndex, CompetitionScope, CompetitionStatistics, CompetitionYearStat, YearFilter } from '../models/competition.ts';
import type { Municipality } from '../models/region.ts';
import { normalizeMunicipalityName, per10000Residents } from './populationService.ts';

export function parseCompetitions(payload: unknown): Competition[] {
  if (!Array.isArray(payload)) throw new Error('Kilpailuaineiston on oltava JSON-taulukko.');
  return payload.map((row: unknown, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)
      || !('Kilpailun nimi' in row) || typeof row['Kilpailun nimi'] !== 'string' || !row['Kilpailun nimi'].trim()
      || !('Vuosi' in row) || typeof row.Vuosi !== 'number' || !Number.isSafeInteger(row.Vuosi) || row.Vuosi < 1
      || !('Kunta' in row) || typeof row.Kunta !== 'string' || !row.Kunta.trim()) {
      throw new Error(`Kilpailuaineiston rivi ${index + 1} on virheellinen: tarvitaan Kilpailun nimi, kokonaislukuvuosi Vuosi ja Kunta.`);
    }
    return { 'Kilpailun nimi': row['Kilpailun nimi'], Vuosi: row.Vuosi, Kunta: row.Kunta };
  });
}

export function indexCompetitions(records: readonly Competition[]): CompetitionIndex {
  const byYear = new Map<number, Competition[]>();
  const byMunicipality: CompetitionIndex['byMunicipality'] = new Map();
  for (const row of records) {
    const year = byYear.get(row.Vuosi) ?? [];
    year.push(row);
    byYear.set(row.Vuosi, year);
    const key = normalizeMunicipalityName(row.Kunta);
    const municipality = byMunicipality.get(key) ?? { name: row.Kunta.trim(), records: [], firstYear: row.Vuosi };
    municipality.records.push(row);
    municipality.firstYear = Math.min(municipality.firstYear, row.Vuosi);
    byMunicipality.set(key, municipality);
  }
  return { records, byYear, byMunicipality, years: [...byYear.keys()].sort((a, b) => a - b) };
}

export function validateYearFilter(filter: YearFilter): void {
  const validYear = (year: number) => Number.isSafeInteger(year) && year > 0;
  if (filter.mode === 'selected' && !filter.years.every(validYear)
    || filter.mode === 'range' && (!validYear(filter.from) || !validYear(filter.to) || filter.from > filter.to)) {
    throw new Error('Vuosisuodatin on virheellinen.');
  }
}

export function matchesCompetitionYear(year: number, filter: YearFilter): boolean {
  return filter.mode === 'all' || (filter.mode === 'selected'
    ? filter.years.includes(year) : year >= filter.from && year <= filter.to);
}

export function selectedCompetitionYears(index: CompetitionIndex, filter: YearFilter): number[] {
  validateYearFilter(filter);
  return filter.mode === 'selected' ? [...new Set(filter.years)].sort((a, b) => a - b)
    : index.years.filter((year) => matchesCompetitionYear(year, filter));
}

export function filterCompetitions(index: CompetitionIndex, filter: YearFilter, scope: CompetitionScope = {}): Competition[] {
  const names = scope.municipalityNames ? new Set(scope.municipalityNames.map(normalizeMunicipalityName)) : null;
  const municipality = scope.municipality === undefined ? null : normalizeMunicipalityName(scope.municipality);
  return selectedCompetitionYears(index, filter).flatMap((year) => index.byYear.get(year) ?? []).filter((row) => {
    const name = normalizeMunicipalityName(row.Kunta);
    return (!names || names.has(name)) && (municipality === null || name === municipality);
  });
}

export function getCompetitionStatistics(
  index: CompetitionIndex, filter: YearFilter, scope: CompetitionScope = {}, geography: readonly Municipality[] = [],
): CompetitionStatistics {
  const selectedYears = selectedCompetitionYears(index, filter);
  const records = filterCompetitions(index, filter, scope);
  const byYearCounts = new Map<number, number>();
  const grouped = new Map<string, Map<number, number>>();
  for (const row of records) {
    byYearCounts.set(row.Vuosi, (byYearCounts.get(row.Vuosi) ?? 0) + 1);
    const name = normalizeMunicipalityName(row.Kunta);
    const counts = grouped.get(name) ?? new Map<number, number>();
    counts.set(row.Vuosi, (counts.get(row.Vuosi) ?? 0) + 1);
    grouped.set(name, counts);
  }
  const geographyByName = new Map(geography.map((item) => [normalizeMunicipalityName(item.name), item]));
  const municipalities = [...grouped].map(([key, counts]) => {
    const entry = index.byMunicipality.get(key)!;
    const count = [...counts.values()].reduce((sum, value) => sum + value, 0);
    const municipality = geographyByName.get(key);
    return {
      name: entry.name, count, rank: 0, share: records.length ? count / records.length : 0,
      activeYears: counts.size, firstYear: entry.firstYear,
      byYear: selectedYears.map((year) => ({ year, count: counts.get(year) ?? 0 })),
      per10000Residents: per10000Residents(count, municipality?.population ?? null),
      per1000Km2: municipality && municipality.areaKm2 > 0 ? count / municipality.areaKm2 * 1000 : null,
    };
  }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fi'));
  municipalities.forEach((row, i) => { row.rank = i > 0 && municipalities[i - 1].count === row.count ? municipalities[i - 1].rank : i + 1; });
  const byYear = selectedYears.map((year) => {
    const count = byYearCounts.get(year) ?? 0;
    // A non-adjacent selected year is a historical comparison, not a year-over-year baseline.
    const previous = selectedYears.includes(year - 1) ? byYearCounts.get(year - 1) ?? 0 : null;
    return {
      year, count, municipalityCount: municipalities.filter((item) => item.byYear.some((row) => row.year === year && row.count > 0)).length,
      newMunicipalities: municipalities.filter((item) => item.firstYear === year).map((item) => item.name).sort((a, b) => a.localeCompare(b, 'fi')),
      change: previous === null ? null : count - previous,
      changePercent: previous === null || previous === 0 ? null : (count - previous) / previous * 100,
    };
  });
  const first = byYear[0]; const last = byYear[byYear.length - 1];
  const distribution = [
    { label: '1 kilpailu', min: 1, max: 1 }, { label: '2–5 kilpailua', min: 2, max: 5 },
    { label: '6–10 kilpailua', min: 6, max: 10 }, { label: 'Yli 10 kilpailua', min: 11, max: Infinity },
  ].map(({ label, min, max }) => ({ label, count: municipalities.filter((row) => row.count >= min && row.count <= max).length }));
  return {
    total: records.length, selectedYears, municipalityCount: municipalities.length,
    averagePerMunicipality: municipalities.length ? records.length / municipalities.length : null,
    byYear, municipalities, distribution,
    comparison: first && last && first.year !== last.year ? compareCompetitionYears(byYear, first.year, last.year) : null,
  };
}

export function compareCompetitionYears(rows: readonly CompetitionYearStat[], from: number, to: number) {
  const first = rows.find((row) => row.year === from);
  const last = rows.find((row) => row.year === to);
  if (!first || !last) throw new Error('Vertailuvuosien on kuuluttava aktiiviseen kilpailuvuosisuodatukseen.');
  return { from, to, change: last.count - first.count, changePercent: first.count ? (last.count - first.count) / first.count * 100 : null };
}

export function competitionCountForMunicipalities(index: CompetitionIndex | null, filter: YearFilter, names: readonly string[]): number | null {
  return index ? filterCompetitions(index, filter, { municipalityNames: names }).length : null;
}

export function describeCompetitionYears(filter: YearFilter): string {
  return filter.mode === 'all' ? 'Kaikki vuodet' : filter.mode === 'range' ? `${filter.from}–${filter.to}`
    : filter.years.length ? [...new Set(filter.years)].sort((a, b) => a - b).join(', ') : 'Ei valittuja vuosia';
}
