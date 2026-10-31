import type { Competition, CompetitionAliasResolution, CompetitionDataset, CompetitionIssue, CompetitionMunicipality } from '../models/competition';
import type { MunicipalityDataset } from '../models/region';
import { normalizeMunicipalityName } from '../services/populationService.ts';

export const COMPETITION_URL = './data/SFL-Kilpailut_lopullinen.json';

// Only explicit modern-municipality annotations from the supplied competition locations.
export const COMPETITION_MUNICIPALITY_ALIASES = [
  ['Kuopio (Nilsiä)', 'Kuopio'],
  ['Nilsiä (Kuopio)', 'Kuopio'],
  ['Nilsiä, Kuopio', 'Kuopio'],
  ['Jämsä (Jämsänkoski)', 'Jämsä'],
  ['Lahti (Nastola)', 'Lahti'],
  ['Eurajoki (Luvia)', 'Eurajoki'],
  ['Raasepori, Karjaa', 'Raasepori'],
  ['Raasepori, Skogby', 'Raasepori'],
  ['Tammisaari, Raasepori', 'Raasepori'],
  ['Sammatti, Lohja', 'Lohja'],
  ['Lohja, Sammatti', 'Lohja'],
  ['Lohja + Sammatti', 'Lohja'],
  ['Lohja(Lohja, Sammatti)', 'Lohja'],
  ['Ahvenanmaa (Geta)', 'Geta'],
  ['Ahvenanmaa, Geta', 'Geta'],
  ['Geta, Ahvenanmaa', 'Geta'],
  ['Geta, Åland', 'Geta'],
  ['Jomala, Åland Islands', 'Jomala'],
  ['Hammarland, Ahvenanmaa', 'Hammarland'],
  ['Maarianhamina, Ahvenanmaa', 'Maarianhamina'],
] as const;

export function normalizeCompetitionMunicipalityAlias(value: string): string {
  return normalizeMunicipalityName(value).replace(/\s*([(),+])\s*/g, '$1');
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

function validDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? time
    : null;
}

function normalizeText(value: string): string {
  return normalizeMunicipalityName(value);
}

function addToMap<T>(map: Map<string, T[]>, key: string, value: T): void {
  const items = map.get(key);
  if (items) items.push(value);
  else map.set(key, [value]);
}

function grams(value: string): string[] {
  const normalized = normalizeText(value);
  const width = Math.min(3, normalized.length);
  if (!width) return [];
  const result = new Set<string>();
  for (let index = 0; index <= normalized.length - width; index++) result.add(normalized.slice(index, index + width));
  return [...result];
}

function addGrams(index: Map<string, Set<string>>, value: string, id: string): void {
  for (const gram of grams(value)) {
    let ids = index.get(gram);
    if (!ids) index.set(gram, ids = new Set());
    ids.add(id);
  }
}

function slug(value: string): string {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'unknown';
}

export function buildCompetitionMunicipalityAliases(dataset: MunicipalityDataset): Map<string, string | null> {
  const aliases = new Map<string, string | null>();
  for (const municipality of dataset.municipalities) {
    for (const name of [municipality.name, municipality.nameSv, municipality.code]) {
      if (!name) continue;
      const key = normalizeCompetitionMunicipalityAlias(name);
      const previous = aliases.get(key);
      if (previous !== undefined && previous !== municipality.code) aliases.set(key, null);
      else aliases.set(key, municipality.code);
    }
  }
  for (const [sourceName, targetName] of COMPETITION_MUNICIPALITY_ALIASES) {
    const targetCode = aliases.get(normalizeCompetitionMunicipalityAlias(targetName));
    if (!targetCode) continue;
    const key = normalizeCompetitionMunicipalityAlias(sourceName);
    if (!aliases.has(key)) aliases.set(key, targetCode);
    else if (aliases.get(key) !== targetCode) aliases.set(key, null);
  }
  return aliases;
}

function parseCourseList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(text).filter((course): course is string => course !== null);
}

function parseMunicipality(
  value: unknown,
  position: number,
  aliases: Map<string, string | null>,
  issues: string[],
): CompetitionMunicipality {
  if (!isRecord(value)) {
    issues.push(`Sijaintitietue ${position + 1} on virheellinen.`);
    return { name: `Tuntematon kunta (sijainti ${position + 1})`, primary: false, courses: [], municipalityCode: null };
  }

  const name = text(value.name);
  const primary = value.primary === true;
  const courses = parseCourseList(value.courses);
  if (!name) issues.push(`Sijaintitietueesta ${position + 1} puuttuu kunnan nimi.`);
  if (!Array.isArray(value.courses) || courses.length === 0) {
    issues.push(`${name ?? `Sijainti ${position + 1}`}: rata puuttuu.`);
  }

  const label = name ?? `Tuntematon kunta (sijainti ${position + 1})`;
  const key = normalizeCompetitionMunicipalityAlias(label);
  const hasAlias = aliases.has(key);
  const municipalityCode = hasAlias ? aliases.get(key) ?? null : null;
  if (hasAlias && municipalityCode === null) issues.push(`Kunnan nimi ”${label}” on kuntatiedoissa epäselvä.`);
  else if (!hasAlias) issues.push(`Kuntaa ”${label}” ei voitu yhdistää kuntatietoihin.`);
  return { name: label, primary, courses, municipalityCode };
}

function stableBase(competition: Omit<Competition, 'id'>): string {
  const primary = competition.municipalities.filter((item) => item.primary).map((item) => item.name).join('-') || 'no-primary';
  return [
    slug(competition.name),
    competition.year ?? 'unknown-year',
    slug(competition.startDate || 'no-start-date'),
    slug(competition.endDate || 'no-end-date'),
    slug(primary),
    slug(competition.organizer),
  ].join('-');
}

export function getCompetitionIdentifierBase(competition: Competition): string {
  return stableBase(competition);
}

function normalizeCompetitionRow(
  row: unknown,
  sourceIndex: number,
  aliases: Map<string, string | null>,
): Omit<Competition, 'id'> {
    const record = isRecord(row) ? row : {};
    const sourceName = text(record.name);
    const name = sourceName ?? `Nimetön kilpailu (tietue ${sourceIndex + 1})`;
    const rowIssues: string[] = [];
    if (!isRecord(row)) rowIssues.push('Kilpailutietue on virheellinen.');
    if (!sourceName) rowIssues.push('Kilpailun nimi puuttuu.');

    const year = typeof record.year === 'number' && Number.isSafeInteger(record.year) ? record.year : null;
    if (year === null) rowIssues.push('Kilpailun vuosi puuttuu tai on virheellinen.');

    const startDate = text(record.startDate) ?? '';
    const endDate = text(record.endDate) ?? '';
    const startTime = validDate(startDate);
    const endTime = validDate(endDate);
    if (!startDate || startTime === null) rowIssues.push('Alkamispäivä puuttuu tai on virheellinen.');
    if (!endDate || endTime === null) rowIssues.push('Päättymispäivä puuttuu tai on virheellinen.');
    if (year !== null && startDate && /^\d{4}-/.test(startDate) && Number(startDate.slice(0, 4)) !== year) {
      rowIssues.push(`Ilmoitettu vuosi ${year} ei vastaa alkamispäivän vuotta.`);
    }
    if (startTime !== null && endTime !== null && endTime < startTime) {
      rowIssues.push('Päivämääräväli on käänteinen; alkuperäisiä päivämääriä ei korjattu.');
    }

    const competitionModel = text(record.competitionModel) ?? '';
    const divisionType = text(record.divisionType) ?? '';
    const pdgaTier = text(record.pdgaTier) ?? '';
    const organizer = text(record.organizer) ?? '';
    if (!competitionModel) rowIssues.push('Kilpailumalli puuttuu.');
    if (!divisionType) rowIssues.push('Sarjatyyppi puuttuu.');
    if (!pdgaTier) rowIssues.push('PDGA-taso puuttuu.');
    if (!organizer) rowIssues.push('Järjestäjä puuttuu.');

    const locations = Array.isArray(record.municipalities)
      ? record.municipalities.map((item, index) => parseMunicipality(item, index, aliases, rowIssues))
      : [];
    if (!Array.isArray(record.municipalities) || locations.length === 0) {
      rowIssues.push('Kilpailulta puuttuu kuntasijainti.');
    }
    const primaryCount = locations.filter((item) => item.primary).length;
    if (primaryCount !== 1) {
      rowIssues.push(primaryCount === 0
        ? 'Kilpailulla ei ole täsmälleen yhtä ensisijaista kuntaa.'
        : `Kilpailulla on ${primaryCount} ensisijaista kuntaa; ensisijaista kuntaryhmitystä ei tehdä.`);
    }

    const conventionalTiers = new Set(['A-tier', 'B-tier', 'C-tier', 'L-tier (PDGA-liiga)']);
    if (pdgaTier && !conventionalTiers.has(pdgaTier)) {
      rowIssues.push(`PDGA-taso ”${pdgaTier}” poikkeaa tavallisista tasomerkinnöistä.`);
    }

    return {
      sourceIndex,
      name,
      year,
      startDate,
      endDate,
      competitionModel,
      divisionType,
      pdgaTier,
      organizer,
      municipalities: locations,
      issues: rowIssues,
      durationDays: startTime !== null && endTime !== null && endTime >= startTime
        ? Math.floor((endTime - startTime) / 86_400_000) + 1
        : null,
    };
}

// A single row has its unsuffixed base ID; dataset parsing adds suffixes only when bases collide.
export function normalizeCompetition(input: unknown, sourceIndex: number, dataset: MunicipalityDataset): Competition {
  const competition = normalizeCompetitionRow(input, sourceIndex, buildCompetitionMunicipalityAliases(dataset));
  return { ...competition, id: stableBase(competition) };
}

export function createCompetitionDataset(input: unknown, dataset: MunicipalityDataset): CompetitionDataset {
  if (!isRecord(input) || !Array.isArray(input.competitions)) {
    throw new Error('Kilpailuaineiston rakenne on virheellinen.');
  }

  const aliases = buildCompetitionMunicipalityAliases(dataset);
  const sourceRows = input.competitions;
  const parsed = sourceRows.map((row, sourceIndex) => normalizeCompetitionRow(row, sourceIndex, aliases));

  const baseCounts = new Map<string, number>();
  for (const item of parsed) {
    const base = stableBase(item);
    baseCounts.set(base, (baseCounts.get(base) ?? 0) + 1);
  }
  const competitions: Competition[] = parsed.map((item) => {
    const base = stableBase(item);
    return { ...item, id: baseCounts.get(base)! > 1 ? `${base}-${item.sourceIndex}` : base };
  });

  const issues: CompetitionIssue[] = [];
  const aliasResolutions: CompetitionAliasResolution[] = [];
  const annotationKeys = new Set(COMPETITION_MUNICIPALITY_ALIASES.map(([name]) => normalizeCompetitionMunicipalityAlias(name)));
  const byId = new Map<string, Competition>();
  const byYear = new Map<number, Competition[]>();
  const byOrganizer = new Map<string, Competition[]>();
  const byModel = new Map<string, Competition[]>();
  const byTier = new Map<string, Competition[]>();
  const byMunicipalityCode = new Map<string, Competition[]>();
  const municipalityNamesByCode = new Map([...dataset.byCode].map(([code, municipality]) => [code, {
    code, name: municipality.name, nameSv: municipality.nameSv,
  }]));
  const byNameGram = new Map<string, Set<string>>();
  const byLocationGram = new Map<string, Set<string>>();
  const byModelGram = new Map<string, Set<string>>();
  const byTierGram = new Map<string, Set<string>>();
  const byOrganizerGram = new Map<string, Set<string>>();

  for (const competition of competitions) {
    byId.set(competition.id, competition);
    if (competition.year !== null) {
      const yearCompetitions = byYear.get(competition.year);
      if (yearCompetitions) yearCompetitions.push(competition);
      else byYear.set(competition.year, [competition]);
    }
    addToMap(byOrganizer, normalizeText(competition.organizer), competition);
    addToMap(byModel, normalizeText(competition.competitionModel), competition);
    addToMap(byTier, normalizeText(competition.pdgaTier), competition);
    for (const code of new Set(competition.municipalities.map((item) => item.municipalityCode).filter((code): code is string => code !== null))) {
      addToMap(byMunicipalityCode, code, competition);
    }

    const textFields = [
      competition.name, competition.organizer, competition.competitionModel, competition.divisionType, competition.pdgaTier,
      ...competition.municipalities.flatMap((item) => [item.name, ...item.courses]),
    ];
    for (const field of textFields) addGrams(byNameGram, field, competition.id);
    for (const item of competition.municipalities) {
      addGrams(byLocationGram, item.name, competition.id);
      if (item.municipalityCode) {
        addGrams(byLocationGram, item.municipalityCode, competition.id);
        const municipality = dataset.byCode.get(item.municipalityCode);
        if (municipality) {
          addGrams(byLocationGram, municipality.name, competition.id);
          if (municipality.nameSv) addGrams(byLocationGram, municipality.nameSv, competition.id);
          if (annotationKeys.has(normalizeCompetitionMunicipalityAlias(item.name))) {
            aliasResolutions.push({
              sourceIndex: competition.sourceIndex, competitionId: competition.id,
              sourceName: item.name, municipalityCode: municipality.code, municipalityName: municipality.name,
            });
          }
          for (const [aliasName, targetName] of COMPETITION_MUNICIPALITY_ALIASES) {
            if (aliases.get(normalizeCompetitionMunicipalityAlias(aliasName)) === municipality.code
              && normalizeText(targetName) === normalizeText(municipality.name)) {
              addGrams(byLocationGram, aliasName, competition.id);
            }
          }
        }
      }
    }
    addGrams(byModelGram, competition.competitionModel, competition.id);
    addGrams(byTierGram, competition.pdgaTier, competition.id);
    addGrams(byOrganizerGram, competition.organizer, competition.id);
    for (const message of competition.issues) {
      issues.push({ sourceIndex: competition.sourceIndex, competitionId: competition.id, name: competition.name, message });
    }
  }

  return {
    competitions,
    years: [...byYear.keys()].map(Number).sort((a, b) => a - b),
    issues,
    byId,
    byYear,
    byOrganizer,
    byModel,
    byTier,
    byMunicipalityCode,
    municipalityNamesByCode,
    municipalityAliases: aliases,
    aliasResolutions,
    indexes: { byOrganizer, byModel, byTier, byMunicipalityCode, byNameGram, byLocationGram, byModelGram, byTierGram, byOrganizerGram },
  };
}

const cache = new WeakMap<MunicipalityDataset, Promise<CompetitionDataset>>();

export const competitionRepository = {
  getCompetitions(dataset: MunicipalityDataset, fetcher: typeof fetch = fetch): Promise<CompetitionDataset> {
    let request = cache.get(dataset);
    if (!request) {
      request = fetcher(COMPETITION_URL, { cache: 'no-cache' })
        .then((response) => {
          if (!response.ok) throw new Error(`Kilpailuaineistoa ei voitu ladata (HTTP ${response.status}).`);
          return response.json();
        })
        .then((input) => createCompetitionDataset(input, dataset))
        .catch((error: unknown) => {
          cache.delete(dataset);
          throw error;
        });
      cache.set(dataset, request);
    }
    return request;
  },
  clearCache(dataset?: MunicipalityDataset): void {
    if (dataset) cache.delete(dataset);
  },
};
