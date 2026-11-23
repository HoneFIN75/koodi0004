import type { MunicipalityDataset, Region } from '../models/region';
import type { ScenarioAnalysis } from './regionAnalytics.ts';
import { formatPercent } from './regionAnalytics.ts';

export const VALIDATION_THRESHOLDS = { maxAreaShare: 0.4, highRatio: 1.5, lowRatio: 0.5 } as const;

export interface ValidationWarning {
  id: string;
  severity: 'warning' | 'info';
  regionId: string | null;
  message: string;
}

const listNames = (names: string[], limit = 5) => names.length <= limit ? names.join(', ') : `${names.slice(0, limit).join(', ')} ja ${names.length - limit} muuta`;

export function validateScenario(regions: Region[], dataset: MunicipalityDataset, analysis: ScenarioAnalysis): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  if (analysis.unassigned.length > 0) {
    warnings.push({
      id: 'unassigned', severity: 'warning', regionId: null,
      message: `${analysis.unassigned.length} kuntaa ei kuulu mihinkään käytössä olevaan alueeseen: ${listNames(analysis.unassigned.map((row) => row.municipality.name))}.`,
    });
  }
  const numbers = new Map<number, Region[]>();
  for (const region of regions) numbers.set(region.number, [...(numbers.get(region.number) ?? []), region]);
  for (const [number, duplicates] of numbers) {
    if (duplicates.length > 1) warnings.push({ id: `duplicate-${number}`, severity: 'info', regionId: null, message: `Aluenumero ${number} on käytössä usealla alueella: ${duplicates.map((region) => region.name).join(', ')}.` });
  }
  const comparable = analysis.activeRegions.map((region) => analysis.stats.get(region.id)).filter((stats) => stats && stats.municipalityCount > 0);
  const averageMembers = comparable.length > 1 ? comparable.reduce((sum, stats) => sum + (stats?.members ?? 0), 0) / comparable.length : null;
  const averageVotes = comparable.length > 1 ? comparable.reduce((sum, stats) => sum + (stats?.votes ?? 0), 0) / comparable.length : null;

  for (const region of analysis.activeRegions) {
    const stats = analysis.stats.get(region.id);
    if (!stats) continue;
    const add = (key: string, message: string, severity: ValidationWarning['severity'] = 'warning') => warnings.push({ id: `${region.id}-${key}`, severity, regionId: region.id, message: `${region.name}: ${message}` });
    if (stats.missingCodes.length > 0) add('missing', `${stats.missingCodes.length} tuntematonta kuntakoodia (${stats.missingCodes.join(', ')}). Kunta on voinut lakata tai yhdistyä.`);
    if (stats.municipalityCount === 0) { add('empty', 'alueeseen ei ole valittu kuntia.'); continue; }
    if (stats.clubCount === 0) add('no-clubs', 'alueella ei ole yhtään seuraa.');
    if (stats.municipalityCount === 1) add('single', 'alue sisältää vain yhden kunnan.', 'info');
    if (stats.areaShare > VALIDATION_THRESHOLDS.maxAreaShare) add('area', `alue kattaa ${formatPercent(stats.areaShare)} Suomen pinta-alasta (raja ${formatPercent(VALIDATION_THRESHOLDS.maxAreaShare)}).`);
    if (averageMembers !== null && averageMembers > 0) {
      if (stats.members > averageMembers * VALIDATION_THRESHOLDS.highRatio) add('members-high', `jäsenmäärä (${Math.round(stats.members)}) on selvästi alueiden keskiarvoa (${Math.round(averageMembers)}) suurempi.`);
      else if (stats.members < averageMembers * VALIDATION_THRESHOLDS.lowRatio) add('members-low', `jäsenmäärä (${Math.round(stats.members)}) on selvästi alueiden keskiarvoa (${Math.round(averageMembers)}) pienempi.`);
    }
    if (averageVotes !== null && averageVotes > 0) {
      if (stats.votes > averageVotes * VALIDATION_THRESHOLDS.highRatio) add('votes-high', `äänimäärä (${stats.votes}) on selvästi alueiden keskiarvoa (${Math.round(averageVotes)}) suurempi.`);
      else if (stats.votes < averageVotes * VALIDATION_THRESHOLDS.lowRatio) add('votes-low', `äänimäärä (${stats.votes}) on selvästi alueiden keskiarvoa (${Math.round(averageVotes)}) pienempi.`);
    }
  }
  if (dataset.municipalities.length === 0) warnings.push({ id: 'no-geo', severity: 'warning', regionId: null, message: 'Kuntarajoja ei ole saatavilla.' });
  return warnings;
}
