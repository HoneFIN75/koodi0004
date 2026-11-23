import type { Club } from '../models/club';
import type { CompetitionContext } from '../models/competition.ts';
import { getCompetitionStatistics } from './competitionService.ts';
import type { Municipality, MunicipalityDataset, Region } from '../models/region';
import { pointInGeometry } from './geoService.ts';
import { getCoveragePopulation, getDatasetPopulation, matchesPopulation, normalizeMunicipalityName, per10000Residents, summarizePopulation, type PopulationFilters } from './populationService.ts';

export interface ClubPlacement {
  club: Club;
  municipalityCode: string | null;
  method: 'name' | 'location' | null;
}

export interface MunicipalityAggregate {
  municipality: Municipality;
  clubs: Club[];
  members: number;
  votes: number;
  competitionCount: number | null;
}

export interface RegionStats {
  regionId: string;
  municipalityCount: number;
  municipalities: Municipality[];
  missingCodes: string[];
  clubs: Club[];
  clubCount: number;
  members: number;
  votes: number;
  averageMembers: number | null;
  largestClub: Club | null;
  smallestClub: Club | null;
  areaKm2: number;
  areaShare: number;
  population: number | null;
  populationShare: number | null;
  averagePopulation: number | null;
  medianPopulation: number | null;
  largestMunicipality: Municipality | null;
  smallestMunicipality: Municipality | null;
  clubsPer10000: number | null;
  membersPer10000: number | null;
  populationDensity: number | null;
  clubsPerKm2: number;
  membersPerKm2: number;
  competitionCount: number | null;
  competitionsPer10000: number | null;
  competitionsPer1000Km2: number | null;
}

export interface PlannerFilters extends PopulationFilters {
  clubQuery: string;
  municipalityQuery: string;
  minMembers: number;
  maxMembers: number | null;
  votes: number | null;
  regionIds: string[];
}

export const emptyFilters: PlannerFilters = { clubQuery: '', municipalityQuery: '', minMembers: 0, maxMembers: null, votes: null, regionIds: [] };

export const normalizeName = normalizeMunicipalityName;

export function assignClubs(clubs: Club[], dataset: MunicipalityDataset): ClubPlacement[] {
  const byName = new Map<string, string>();
  for (const municipality of dataset.municipalities) {
    byName.set(normalizeName(municipality.name), municipality.code);
    if (municipality.nameSv) byName.set(normalizeName(municipality.nameSv), municipality.code);
  }
  return clubs.map((club) => {
    const code = byName.get(normalizeName(club.paikkakunta));
    if (code) return { club, municipalityCode: code, method: 'name' };
    if (club.latitude !== null && club.longitude !== null) {
      const point: [number, number] = [club.longitude, club.latitude];
      const match = dataset.municipalities.find(({ bounds: [[minLng, minLat], [maxLng, maxLat]], geometry }) => (
        point[0] >= minLng && point[0] <= maxLng && point[1] >= minLat && point[1] <= maxLat && pointInGeometry(point, geometry)
      ));
      if (match) return { club, municipalityCode: match.code, method: 'location' };
    }
    return { club, municipalityCode: null, method: null };
  });
}

export function aggregateByMunicipality(placements: ClubPlacement[], dataset: MunicipalityDataset, competitions?: CompetitionContext): Map<string, MunicipalityAggregate> {
  const index = new Map<string, MunicipalityAggregate>();
  const competitionStats = competitions?.index ? getCompetitionStatistics(competitions.index, competitions.yearFilter) : null;
  const counts = new Map(competitionStats?.municipalities.map((row) => [normalizeName(row.name), row.count]));
  for (const municipality of dataset.municipalities) index.set(municipality.code, {
    municipality, clubs: [], members: 0, votes: 0, competitionCount: competitionStats ? counts.get(normalizeName(municipality.name)) ?? 0 : null,
  });
  for (const { club, municipalityCode } of placements) {
    const aggregate = municipalityCode ? index.get(municipalityCode) : undefined;
    if (!aggregate) continue;
    aggregate.clubs.push(club);
    aggregate.members += club.jasenmaara ?? 0;
    aggregate.votes += club.aanimaara ?? 0;
  }
  return index;
}

export function filterPlacements(placements: ClubPlacement[], filters: PlannerFilters, dataset: MunicipalityDataset, regions: Region[]): ClubPlacement[] {
  const clubQuery = normalizeName(filters.clubQuery);
  const municipalityQuery = normalizeName(filters.municipalityQuery);
  const regionCodes = filters.regionIds.length === 0 ? null
    : new Set(regions.filter((region) => filters.regionIds.includes(region.id)).flatMap((region) => region.municipalityCodes));
  return placements.filter(({ club, municipalityCode }) => {
    if (!matchesPopulation(municipalityCode ? dataset.byCode.get(municipalityCode)?.population ?? null : null, filters)) return false;
    if (clubQuery && !normalizeName(club.seura).includes(clubQuery)) return false;
    if (municipalityQuery) {
      const municipality = municipalityCode ? dataset.byCode.get(municipalityCode) : undefined;
      const names = [club.paikkakunta, municipality?.name ?? '', municipality?.nameSv ?? ''].map(normalizeName);
      if (!names.some((name) => name.includes(municipalityQuery))) return false;
    }
    const members = club.jasenmaara;
    if (filters.minMembers > 0 && (members === null || members < filters.minMembers)) return false;
    if (filters.maxMembers !== null && members !== null && members > filters.maxMembers) return false;
    if (filters.votes !== null && club.aanimaara !== filters.votes) return false;
    if (regionCodes && (!municipalityCode || !regionCodes.has(municipalityCode))) return false;
    return true;
  });
}

export function computeRegionStats(region: Region, dataset: MunicipalityDataset, index: Map<string, MunicipalityAggregate>): RegionStats {
  const municipalities: Municipality[] = [];
  const missingCodes: string[] = [];
  const clubs: Club[] = [];
  let members = 0; let votes = 0; let areaKm2 = 0;
  for (const code of new Set(region.municipalityCodes)) {
    const municipality = dataset.byCode.get(code);
    if (!municipality) { missingCodes.push(code); continue; }
    municipalities.push(municipality);
    areaKm2 += municipality.areaKm2;
    const aggregate = index.get(code);
    if (aggregate) { clubs.push(...aggregate.clubs); members += aggregate.members; votes += aggregate.votes; }
  }
  municipalities.sort((a, b) => a.name.localeCompare(b.name, 'fi'));
  const known = clubs.filter((club) => club.jasenmaara !== null);
  const sorted = [...known].sort((a, b) => (b.jasenmaara ?? 0) - (a.jasenmaara ?? 0) || a.seura.localeCompare(b.seura, 'fi'));
  const populationStats = summarizePopulation(municipalities);
  const population = missingCodes.length ? null : populationStats.total;
  const national = getDatasetPopulation(dataset).total;
  const competitionCount = missingCodes.length || municipalities.some((item) => index.get(item.code)?.competitionCount == null)
    ? null : municipalities.reduce((sum, item) => sum + (index.get(item.code)?.competitionCount ?? 0), 0);
  return {
    regionId: region.id,
    municipalityCount: municipalities.length,
    municipalities, missingCodes,
    clubs: [...clubs].sort((a, b) => (b.jasenmaara ?? -1) - (a.jasenmaara ?? -1) || a.seura.localeCompare(b.seura, 'fi')),
    clubCount: clubs.length,
    members, votes,
    averageMembers: known.length ? known.reduce((sum, club) => sum + (club.jasenmaara ?? 0), 0) / known.length : null,
    largestClub: sorted[0] ?? null,
    smallestClub: sorted[sorted.length - 1] ?? null,
    areaKm2,
    areaShare: dataset.totalAreaKm2 > 0 ? areaKm2 / dataset.totalAreaKm2 : 0,
    population,
    populationShare: population !== null && national !== null && national > 0 ? population / national : null,
    averagePopulation: populationStats.average,
    medianPopulation: populationStats.median,
    largestMunicipality: populationStats.largest,
    smallestMunicipality: populationStats.smallest,
    clubsPer10000: per10000Residents(clubs.length, population),
    membersPer10000: per10000Residents(members, population),
    populationDensity: population !== null && areaKm2 > 0 ? population / areaKm2 : null,
    clubsPerKm2: areaKm2 > 0 ? clubs.length / areaKm2 : 0,
    membersPerKm2: areaKm2 > 0 ? members / areaKm2 : 0,
    competitionCount,
    competitionsPer10000: per10000Residents(competitionCount, population),
    competitionsPer1000Km2: competitionCount !== null && areaKm2 > 0 ? competitionCount / areaKm2 * 1000 : null,
  };
}

export interface ScenarioAnalysis {
  stats: Map<string, RegionStats>;
  activeRegions: Region[];
  assignedCodes: Set<string>;
  unassigned: MunicipalityAggregate[];
  totals: { clubs: number; members: number; votes: number; unplacedClubs: Club[]; nationalPopulation: number | null; assignedPopulation: number | null; unassignedPopulation: number | null; clubMunicipalityPopulation: number | null; competitionCount: number | null; assignedCompetitions: number | null; unassignedCompetitions: number | null; unmatchedCompetitionMunicipalities: string[] };
}

/** Disabled regions are excluded from coverage: only enabled regions count as an assignment. */
export function analyzeScenario(regions: Region[], dataset: MunicipalityDataset, placements: ClubPlacement[], competitions?: CompetitionContext): ScenarioAnalysis {
  const index = aggregateByMunicipality(placements, dataset, competitions);
  const stats = new Map(regions.map((region) => [region.id, computeRegionStats(region, dataset, index)]));
  const activeRegions = regions.filter((region) => region.enabled);
  const assignedCodes = new Set(activeRegions.flatMap((region) => region.municipalityCodes).filter((code) => dataset.byCode.has(code)));
  const unassigned = [...index.values()].filter((aggregate) => !assignedCodes.has(aggregate.municipality.code))
    .sort((a, b) => b.members - a.members || a.municipality.name.localeCompare(b.municipality.name, 'fi'));
  const competitionStats = competitions?.index ? getCompetitionStatistics(competitions.index, competitions.yearFilter) : null;
  const knownNames = new Set(dataset.municipalities.map((item) => normalizeName(item.name)));
  return {
    stats, activeRegions, assignedCodes, unassigned,
    totals: {
      clubs: placements.length,
      members: placements.reduce((sum, { club }) => sum + (club.jasenmaara ?? 0), 0),
      votes: placements.reduce((sum, { club }) => sum + (club.aanimaara ?? 0), 0),
      unplacedClubs: placements.filter((placement) => placement.municipalityCode === null).map(({ club }) => club),
      nationalPopulation: getDatasetPopulation(dataset).total,
      assignedPopulation: getCoveragePopulation(regions, dataset),
      unassignedPopulation: summarizePopulation(unassigned.map((item) => item.municipality)).total,
      clubMunicipalityPopulation: summarizePopulation(dataset.municipalities.filter((item) => (index.get(item.code)?.clubs.length ?? 0) > 0)).total,
      competitionCount: competitionStats?.total ?? null,
      assignedCompetitions: competitionStats ? [...assignedCodes].reduce((sum, code) => sum + (index.get(code)?.competitionCount ?? 0), 0) : null,
      unassignedCompetitions: competitionStats ? unassigned.reduce((sum, row) => sum + (row.competitionCount ?? 0), 0) : null,
      unmatchedCompetitionMunicipalities: competitionStats?.municipalities.filter((row) => !knownNames.has(normalizeName(row.name))).map((row) => row.name) ?? [],
    },
  };
}

const percent = new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const integer = new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 0 });
export const formatPercent = (share: number) => `${percent.format(share * 100)} %`;
export const formatArea = (km2: number) => `${integer.format(km2)} km²`;
export const formatDensity = (perKm2: number) => `${new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 2 }).format(perKm2 * 1000)} / 1 000 km²`;

export function explainCoverage(region: Region, stats: RegionStats, analysis: ScenarioAnalysis): string {
  if (stats.municipalityCount === 0) return `${region.name} ei vielä sisällä yhtään kuntaa, joten sen maantieteellistä kattavuutta ei voida arvioida.`;
  const parts: string[] = [];
  const clubShare = analysis.totals.clubs > 0 ? stats.clubCount / analysis.totals.clubs : 0;
  const memberShare = analysis.totals.members > 0 ? stats.members / analysis.totals.members : 0;
  parts.push(`${region.name} kattaa noin ${formatPercent(stats.areaShare)} Suomen pinta-alasta (${formatArea(stats.areaKm2)}) ja ${stats.municipalityCount} ${stats.municipalityCount === 1 ? 'kunnan' : 'kuntaa'}.`);
  parts.push(`Alueella on ${stats.clubCount} ${stats.clubCount === 1 ? 'seura' : 'seuraa'} (${formatPercent(clubShare)} kaikista) ja ${integer.format(stats.members)} jäsentä (${formatPercent(memberShare)}).`);
  if (stats.population !== null) parts.push(`Väestö 2025: ${integer.format(stats.population)} asukasta${stats.populationShare !== null ? ` (${formatPercent(stats.populationShare)} Suomen väestöstä)` : ''}.`);
  if (stats.competitionCount !== null) parts.push(`Aktiivisen vuosisuodattimen mukaisia kilpailuja: ${integer.format(stats.competitionCount)}.`);
  if (stats.clubCount === 0) {
    parts.push('Alueella ei ole lainkaan seuroja, joten se edustaa pelkkää maantieteellistä kattavuutta.');
  } else if (stats.areaShare > memberShare * 2 && stats.areaShare - memberShare > 0.02) {
    parts.push('Pinta-alaosuus on selvästi jäsenosuutta suurempi: alue on maantieteellisesti laaja mutta harvaan jäsenistetty.');
  } else if (memberShare > stats.areaShare * 2 && memberShare - stats.areaShare > 0.02) {
    parts.push('Jäsenosuus on selvästi pinta-alaosuutta suurempi: jäsenistö keskittyy tiiviille alueelle.');
  } else {
    parts.push('Pinta-ala- ja jäsenosuus ovat keskenään melko tasapainossa.');
  }
  const others = analysis.activeRegions.filter((other) => other.id !== region.id).map((other) => analysis.stats.get(other.id)).filter((other): other is RegionStats => !!other && other.municipalityCount > 0);
  const smallerButMoreClubs = others.filter((other) => other.areaKm2 < stats.areaKm2 && other.clubCount > stats.clubCount).length;
  const largerButFewerClubs = others.filter((other) => other.areaKm2 > stats.areaKm2 && other.clubCount < stats.clubCount).length;
  if (smallerButMoreClubs > 0) parts.push(`Alue on pinta-alaltaan suurempi kuin ${smallerButMoreClubs} ${smallerButMoreClubs === 1 ? 'muu alue' : 'muuta aluetta'}, mutta siinä on niitä vähemmän seuroja.`);
  if (largerButFewerClubs > 0) parts.push(`Alueella on enemmän seuroja kuin ${largerButFewerClubs} pinta-alaltaan suuremmalla alueella.`);
  return parts.join(' ');
}
