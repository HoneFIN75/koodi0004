import type {
  Competition, CompetitionDataset, CompetitionFilters, CompetitionMunicipality, GroupedCompetitionCourses,
} from '../models/competition';
import type { MunicipalityDataset, Region } from '../models/region';
import { normalizeCompetitionMunicipalityAlias } from '../data/competitionRepository.ts';
export { normalizeCompetition, getCompetitionIdentifierBase } from '../data/competitionRepository.ts';
import { normalizeMunicipalityName } from './populationService.ts';

const normalize = normalizeMunicipalityName;
const okabeIto = ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7', '#000000'];
const namedYearPalette = new Map(Array.from({ length: 8 }, (_, index) => [2019 + index, okabeIto[index]]));

function grams(value: string): string[] {
  const normalized = normalize(value);
  const width = Math.min(3, normalized.length);
  if (!width) return [];
  const result = new Set<string>();
  for (let index = 0; index <= normalized.length - width; index++) result.add(normalized.slice(index, index + width));
  return [...result];
}

function indexedCandidates(index: Map<string, Set<string>>, query: string, allIds: Iterable<string>): Set<string> {
  const queryGrams = grams(query);
  if (!queryGrams.length) return new Set(allIds);
  let candidates: Set<string> | null = null;
  for (const gram of queryGrams) {
    const matches = index.get(gram);
    if (!matches) return new Set();
    if (candidates === null || matches.size < candidates.size) candidates = new Set(matches);
    else for (const id of candidates) if (!matches.has(id)) candidates.delete(id);
    if (candidates.size === 0) return candidates;
  }
  return candidates ?? new Set();
}

function searchableFields(competition: Competition): string[] {
  return [
    competition.name,
    competition.organizer,
    ...competition.municipalities.flatMap((municipality) => [municipality.name, ...municipality.courses]),
  ];
}

function regionMunicipalityCodes(region: Region): Set<string> {
  return new Set(region.municipalityCodes);
}

function municipalityQueryMatches(
  competition: Competition,
  query: string,
  namesByCode: CompetitionDataset['municipalityNamesByCode'],
  aliases: CompetitionDataset['municipalityAliases'],
): boolean {
  const target = normalize(query);
  if (!target) return true;
  let codes: Set<string> | null = null;
  {
    const matched = [...namesByCode.values()].filter((municipality) =>
      [municipality.name, municipality.nameSv, municipality.code]
        .some((value) => value !== null && normalize(value).includes(target)));
    if (matched.length) codes = new Set(matched.map((municipality) => municipality.code));
  }
  return competition.municipalities.some((municipality) => {
    const aliasCode = aliases.get(normalizeCompetitionMunicipalityAlias(query));
    if (aliasCode && municipality.municipalityCode === aliasCode) return true;
    if (codes?.has(municipality.municipalityCode ?? '')) return true;
    if ([municipality.name, municipality.municipalityCode]
      .some((value) => value !== null && normalize(value).includes(target))) return true;
    if (municipality.municipalityCode) {
      const mapped = namesByCode.get(municipality.municipalityCode);
      return Boolean(mapped && [mapped.name, mapped.nameSv, mapped.code]
        .some((value) => value !== null && normalize(value).includes(target)));
    }
    return false;
  });
}

function hasCompetitionInRegion(
  competition: Competition,
  region: Region,
  options: { includePrimary?: boolean; includeSecondary?: boolean } = {},
): boolean {
  const includePrimary = options.includePrimary ?? true;
  const includeSecondary = options.includeSecondary ?? false;
  const codes = regionMunicipalityCodes(region);
  const primary = getPrimaryMunicipality(competition);
  const primaryMatches = includePrimary && primary?.municipalityCode !== null
    && primary?.municipalityCode !== undefined && codes.has(primary.municipalityCode);
  const secondaryMatches = includeSecondary && competition.municipalities.some((municipality) =>
    !municipality.primary && municipality.municipalityCode !== null && codes.has(municipality.municipalityCode));
  return primaryMatches || secondaryMatches;
}

export function getPrimaryMunicipality(competition: Competition): CompetitionMunicipality | null {
  const primary = competition.municipalities.filter((municipality) => municipality.primary);
  return primary.length === 1 ? primary[0] : null;
}

export function getSecondaryMunicipalities(competition: Competition): CompetitionMunicipality[] {
  return competition.municipalities.filter((municipality) => !municipality.primary);
}

export function getCompetitionMunicipalities(competition: Competition): CompetitionMunicipality[] {
  return competition.municipalities;
}

export function getCompetitionCourses(competition: Competition): GroupedCompetitionCourses[] {
  const groups = new Map<string, GroupedCompetitionCourses>();
  for (const municipality of competition.municipalities) {
    const key = municipality.municipalityCode ?? normalize(municipality.name);
    let group = groups.get(key);
    if (!group) {
      group = {
        municipalityName: municipality.name,
        municipalityCode: municipality.municipalityCode,
        primary: municipality.primary,
        courses: [],
      };
      groups.set(key, group);
    } else if (municipality.primary) {
      group.primary = true;
    }
    for (const course of municipality.courses) if (!group.courses.includes(course)) group.courses.push(course);
  }
  return [...groups.values()];
}

export function filterCompetitions(
  data: CompetitionDataset,
  filters: CompetitionFilters,
  regions?: Region[],
): Competition[] {
  if (filters.visibility === 'hidden') return [];
  const allIds = data.competitions.map((competition) => competition.id);
  let candidates = new Set(allIds);
  const narrow = (ids: Iterable<string>) => {
    const allowed = ids instanceof Set ? ids : new Set(ids);
    candidates = new Set([...candidates].filter((id) => allowed.has(id)));
  };

  if (filters.visibility === 'years') {
    if (!filters.years.length) return [];
    narrow(filters.years.flatMap((year) => data.byYear.get(year)?.map((item) => item.id) ?? []));
  }

  if (filters.model.trim()) {
    const exact = data.byModel.get(normalize(filters.model));
    if (exact) narrow(exact.map((item) => item.id));
    else narrow(indexedCandidates(data.indexes.byModelGram, filters.model, []));
  }
  if (filters.tier.trim()) {
    const exact = data.byTier.get(normalize(filters.tier));
    if (exact) narrow(exact.map((item) => item.id));
    else narrow(indexedCandidates(data.indexes.byTierGram, filters.tier, []));
  }
  if (filters.organizer.trim()) {
    const exact = data.byOrganizer.get(normalize(filters.organizer));
    if (exact) narrow(exact.map((item) => item.id));
    else narrow(indexedCandidates(data.indexes.byOrganizerGram, filters.organizer, []));
  }
  if (filters.municipality.trim()) {
    const aliasCode = data.municipalityAliases.get(normalizeCompetitionMunicipalityAlias(filters.municipality));
    narrow(aliasCode
      ? data.byMunicipalityCode.get(aliasCode)?.map((competition) => competition.id) ?? []
      : indexedCandidates(data.indexes.byLocationGram, filters.municipality, []));
  }
  if (filters.query.trim()) {
    narrow(indexedCandidates(data.indexes.byNameGram, filters.query, []));
  }

  const candidateCompetitions = [...candidates]
    .map((id) => data.byId.get(id))
    .filter((competition): competition is Competition => competition !== undefined)
    .sort((a, b) => a.sourceIndex - b.sourceIndex);
  return candidateCompetitions.filter((competition) => {
    if (filters.model.trim() && !normalize(competition.competitionModel).includes(normalize(filters.model))) return false;
    if (filters.tier.trim() && !normalize(competition.pdgaTier).includes(normalize(filters.tier))) return false;
    if (filters.organizer.trim() && !normalize(competition.organizer).includes(normalize(filters.organizer))) return false;
    if (filters.municipality.trim() && !municipalityQueryMatches(
      competition, filters.municipality, data.municipalityNamesByCode, data.municipalityAliases,
    )) return false;
    if (filters.query.trim() && !searchableFields(competition).some((field) => normalize(field).includes(normalize(filters.query)))) return false;
    if (filters.regionId) {
      const region = regions?.find((item) => item.id === filters.regionId);
      if (!region || !hasCompetitionInRegion(competition, region)) return false;
    }
    return true;
  });
}

export function getAllCompetitions(data: CompetitionDataset): Competition[] {
  return data.competitions;
}

export function getCompetitionById(data: CompetitionDataset, id: string): Competition | null {
  return data.byId.get(id) ?? null;
}

export function getCompetitionYears(data: CompetitionDataset): number[] {
  return data.years;
}

export function getCompetitionsByYear(data: CompetitionDataset, year: number): Competition[] {
  return data.byYear.get(year) ?? [];
}

export function getCompetitionsByOrganizer(data: CompetitionDataset, organizer: string): Competition[] {
  return data.byOrganizer.get(normalize(organizer)) ?? [];
}

export function getCompetitionsByModel(data: CompetitionDataset, model: string): Competition[] {
  return data.byModel.get(normalize(model)) ?? [];
}

export function getCompetitionsByTier(data: CompetitionDataset, tier: string): Competition[] {
  return data.byTier.get(normalize(tier)) ?? [];
}

export function getUniqueCompetitionOrganizers(data: CompetitionDataset): string[] {
  return [...new Set(data.competitions.map((item) => item.organizer).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fi'));
}

export function getUniqueCompetitionModels(data: CompetitionDataset): string[] {
  return [...new Set(data.competitions.map((item) => item.competitionModel).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fi'));
}

export function getUniqueCompetitionTiers(data: CompetitionDataset): string[] {
  return [...new Set(data.competitions.map((item) => item.pdgaTier).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fi'));
}

export function getCompetitionCount(data: CompetitionDataset): number {
  return data.competitions.length;
}

export function getCompetitionCountByYear(data: CompetitionDataset, year: number): number {
  return data.byYear.get(year)?.length ?? 0;
}

export function getCompetitionCountByOrganizer(data: CompetitionDataset, organizer: string): number {
  return getCompetitionsByOrganizer(data, organizer).length;
}

export function getCompetitionCountByModel(data: CompetitionDataset, model: string): number {
  return getCompetitionsByModel(data, model).length;
}

export function getCompetitionCountByTier(data: CompetitionDataset, tier: string): number {
  return getCompetitionsByTier(data, tier).length;
}

export function getCompetitionsByMunicipality(
  data: CompetitionDataset,
  name: string,
  options: { includePrimary?: boolean; includeSecondary?: boolean } = {},
  dataset?: MunicipalityDataset,
): Competition[] {
  const includePrimary = options.includePrimary ?? true;
  const includeSecondary = options.includeSecondary ?? false;
  const target = normalize(name);
  if (!target) return [];
  const labels = dataset
    ? new Map(dataset.municipalities.map((municipality) => [municipality.code, municipality]))
    : data.municipalityNamesByCode;
  const matches = [...labels.values()].filter((municipality) =>
    [municipality.name, municipality.nameSv, municipality.code].some((value) => value !== null && normalize(value) === target));
  const code = data.municipalityAliases.get(normalizeCompetitionMunicipalityAlias(name))
    ?? (matches.length === 1 ? matches[0].code : null);
  const candidates = code
    ? data.byMunicipalityCode.get(code) ?? []
    : [...indexedCandidates(data.indexes.byLocationGram, name, [])]
      .map((id) => data.byId.get(id))
      .filter((competition): competition is Competition => competition !== undefined);
  return candidates.filter((competition) => {
    const primary = getPrimaryMunicipality(competition);
    return competition.municipalities.some((municipality) => {
      if (municipality.primary) {
        if (!includePrimary || primary !== municipality) return false;
      } else if (!includeSecondary) return false;
      return (code !== null && municipality.municipalityCode === code)
        || normalize(municipality.name).includes(target)
        || (municipality.municipalityCode !== null && normalize(municipality.municipalityCode) === target);
    });
  });
}

export function getCompetitionsByRegion(
  data: CompetitionDataset,
  regionId: string,
  regions: Region[],
  options: { includePrimary?: boolean; includeSecondary?: boolean } = {},
): Competition[] {
  const region = regions.find((item) => item.id === regionId);
  if (!region) return [];
  const candidateIds = new Set(region.municipalityCodes.flatMap((code) =>
    data.byMunicipalityCode.get(code)?.map((item) => item.id) ?? []));
  return [...candidateIds]
    .map((id) => data.byId.get(id))
    .filter((competition): competition is Competition => competition !== undefined
      && hasCompetitionInRegion(competition, region, options))
    .sort((a, b) => a.sourceIndex - b.sourceIndex);
}

export function getCompetitionYearColor(year: number): string {
  const named = namedYearPalette.get(year);
  if (named) return named;
  let hash = 0;
  for (const character of String(year)) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  const hue = ((hash >>> 0) * 137.508) % 360;
  return `hsl(${hue.toFixed(1)} 62% 44%)`;
}

export function formatCompetitionDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'Tuntematon päivämäärä';
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return 'Tuntematon päivämäärä';
  }
  return `${day}.${month}.${year}`;
}

export function analyzeCompetitions(
  competitions: readonly Competition[],
  dataset: MunicipalityDataset,
  regions: Region[] = [],
) {
  const primaryCounts = new Map<string, number>();
  const associatedCounts = new Map<string, number>();
  const regionCounts = new Map<string, number>();
  const regionCoverageCounts = new Map<string, number>();
  const yearCounts = new Map<number, number>();
  const modelCounts = new Map<string, number>();
  const tierCounts = new Map<string, number>();
  const organizerCounts = new Map<string, number>();
  const coveredCodes = new Set<string>();
  const primaryCodes = new Set<string>();
  const courseKeys = new Set<string>();
  let unmappedCount = 0;

  for (const competition of competitions) {
    if (competition.year !== null) yearCounts.set(competition.year, (yearCounts.get(competition.year) ?? 0) + 1);
    if (competition.competitionModel) modelCounts.set(competition.competitionModel, (modelCounts.get(competition.competitionModel) ?? 0) + 1);
    if (competition.pdgaTier) tierCounts.set(competition.pdgaTier, (tierCounts.get(competition.pdgaTier) ?? 0) + 1);
    if (competition.organizer) organizerCounts.set(competition.organizer, (organizerCounts.get(competition.organizer) ?? 0) + 1);

    const primary = getPrimaryMunicipality(competition);
    const primaryCode = primary?.municipalityCode ?? null;
    if (primaryCode && dataset.byCode.has(primaryCode)) {
      primaryCodes.add(primaryCode);
      primaryCounts.set(primaryCode, (primaryCounts.get(primaryCode) ?? 0) + 1);
    } else {
      unmappedCount += 1;
    }

    const eventCodes = new Set(competition.municipalities
      .map((municipality) => municipality.municipalityCode)
      .filter((code): code is string => code !== null && dataset.byCode.has(code)));
    for (const code of eventCodes) {
      coveredCodes.add(code);
      associatedCounts.set(code, (associatedCounts.get(code) ?? 0) + 1);
    }
    for (const municipality of competition.municipalities) {
      const municipalityKey = municipality.municipalityCode ?? normalize(municipality.name);
      for (const course of municipality.courses) courseKeys.add(`${municipalityKey}\u0000${normalize(course)}`);
    }

    // Regions may overlap intentionally; each event counts once per region, so their totals need not sum to the national total.
    for (const region of regions) {
      const codes = regionMunicipalityCodes(region);
      if (primaryCode && codes.has(primaryCode)) {
        regionCounts.set(region.id, (regionCounts.get(region.id) ?? 0) + 1);
      }
      if ([...eventCodes].some((code) => codes.has(code))) {
        regionCoverageCounts.set(region.id, (regionCoverageCounts.get(region.id) ?? 0) + 1);
      }
    }
  }

  let coveredPopulation: number | null = 0;
  for (const code of coveredCodes) {
    const population = dataset.byCode.get(code)?.population;
    if (population === null || population === undefined) {
      coveredPopulation = null;
      break;
    }
    coveredPopulation += population;
  }

  return {
    uniqueCount: competitions.length,
    primaryCounts,
    associatedCounts,
    regionCounts,
    regionCoverageCounts,
    yearCounts,
    coveredCodes,
    primaryCodes,
    courses: courseKeys.size,
    coveredPopulation,
    unmappedCount,
    modelCounts,
    tierCounts,
    organizerCounts,
  };
}
