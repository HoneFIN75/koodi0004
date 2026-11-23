import type { CompetitionIndex, YearFilter } from '../models/competition.ts';
import { filterCompetitions } from './competitionService.ts';
import { normalizeMunicipalityName } from './populationService.ts';

export const NO_COMPETITION_COLOR = '#e2e8f0';
export const COMPETITION_COLORS = ['#d9eee2', '#a8d7b6', '#76bd91', '#4b9e70', '#28734d'];

export function getCompetitionCounts(index: CompetitionIndex | null, yearFilter: YearFilter): Map<string, number> {
  const counts = new Map<string, number>();
  if (!index) return counts;
  for (const record of filterCompetitions(index, yearFilter)) {
    const key = normalizeMunicipalityName(record.Kunta);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function getCompetitionMaximum(counts: ReadonlyMap<string, number>): number {
  return Math.max(0, ...counts.values());
}

export function getCompetitionColor(count: number, maximum: number): string {
  if (count <= 0 || maximum <= 0) return NO_COMPETITION_COLOR;
  const thresholds = getCompetitionThresholds(maximum);
  const colorIndex = thresholds.findIndex((threshold) => count <= threshold);
  return COMPETITION_COLORS[Math.max(0, colorIndex)];
}

export function getCompetitionThresholds(maximum: number): number[] {
  if (maximum <= 0) return [];
  return [...new Set(COMPETITION_COLORS.map((_, index) => Math.ceil((index + 1) * maximum / COMPETITION_COLORS.length)))];
}

export function getCompetitionLegend(maximum: number): { label: string; color: string }[] {
  const entries = [{ label: '0', color: NO_COMPETITION_COLOR }];
  let minimum = 1;
  for (const [index, threshold] of getCompetitionThresholds(maximum).entries()) {
    entries.push({
      label: minimum === threshold ? String(threshold) : `${minimum}–${threshold}`,
      color: COMPETITION_COLORS[index],
    });
    minimum = threshold + 1;
  }
  return entries;
}
