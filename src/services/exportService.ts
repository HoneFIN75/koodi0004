import type { Database } from '../models/club';
import { COMPETITION_FILE, type CompetitionContext, type CompetitionStatistics, type YearFilter } from '../models/competition.ts';
import { describeCompetitionYears, getCompetitionStatistics } from './competitionService.ts';
import type { MunicipalityDataset, PlannerDocument, Scenario } from '../models/region';
import { DOCUMENT_FORMAT, activeScenario } from './plannerDocument.ts';
import { analyzeScenario, type ClubPlacement } from './regionAnalytics.ts';
import { createWorkbook, type Cell, type Sheet } from './xlsxWriter.ts';
import { getDatasetPopulation, getMunicipalityRank, getPopulationCategory, normalizeMunicipalityName, per10000Residents, populationService } from './populationService.ts';

export interface ExportContext {
  document: PlannerDocument;
  dataset: MunicipalityDataset;
  placements: ClubPlacement[];
  clubMetadata: Database['metadata'] | null;
  scope: 'all' | 'active';
  exportedAt?: Date;
  competitions?: CompetitionContext;
}

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const scenariosFor = ({ document, scope }: ExportContext): Scenario[] => scope === 'all' ? document.scenarios : [activeScenario(document)];

export function exportJson(context: ExportContext): string {
  const scenarios = scenariosFor(context);
  const competitionIndex = context.competitions?.index;
  const yearFilter: YearFilter = context.competitions?.yearFilter ?? { mode: 'all' };
  return JSON.stringify({
    format: DOCUMENT_FORMAT,
    version: 1,
    exportedAt: (context.exportedAt ?? new Date()).toISOString(),
    metadata: {
      scope: context.scope,
      scenarioCount: scenarios.length,
      regionCount: scenarios.reduce((sum, scenario) => sum + scenario.regions.length, 0),
      clubs: context.clubMetadata,
      municipalities: { source: context.dataset.source, license: context.dataset.license, count: context.dataset.municipalities.length, totalAreaKm2: round(context.dataset.totalAreaKm2) },
      population: { year: populationService.year, nationalPopulation: getDatasetPopulation(context.dataset).total, source: 'User-supplied dataset; original source and reference date unspecified', missingMunicipalities: getDatasetPopulation(context.dataset).missing },
      competitions: { source: COMPETITION_FILE, yearFilter: context.competitions?.yearFilter ?? { mode: 'all' }, available: Boolean(context.competitions?.index) },
    },
    populationAnalytics: scenarios.map((scenario) => {
      const analysis = analyzeScenario(scenario.regions, context.dataset, context.placements);
      return { scenarioId: scenario.id, nationalPopulation: analysis.totals.nationalPopulation, assignedPopulation: analysis.totals.assignedPopulation, unassignedPopulation: analysis.totals.unassignedPopulation, regions: [...analysis.stats.values()].map((stats) => ({
        regionId: stats.regionId, population: stats.population, populationShare: stats.populationShare,
        averagePopulation: stats.averagePopulation, medianPopulation: stats.medianPopulation,
        largestMunicipality: stats.largestMunicipality?.name ?? null, smallestMunicipality: stats.smallestMunicipality?.name ?? null,
        clubsPer10000: stats.clubsPer10000, membersPer10000: stats.membersPer10000, populationDensity: stats.populationDensity,
        municipalities: stats.municipalities.map((item) => ({ code: item.code, name: item.name, population: item.population, rank: getMunicipalityRank(item.name), category: getPopulationCategory(item.population)?.id ?? null })),
      })) };
    }),
    competitionAnalytics: competitionIndex ? {
      ...getCompetitionStatistics(competitionIndex, yearFilter, {}, context.dataset.municipalities),
      scenarios: scenarios.map((scenario) => {
        const analysis = analyzeScenario(scenario.regions, context.dataset, context.placements, context.competitions);
        return {
          scenarioId: scenario.id, assignedCompetitions: analysis.totals.assignedCompetitions,
          unassignedCompetitions: analysis.totals.unassignedCompetitions,
          unmatchedMunicipalities: analysis.totals.unmatchedCompetitionMunicipalities,
          regions: [...analysis.stats.values()].map((stats) => ({ regionId: stats.regionId,
            ...getCompetitionStatistics(competitionIndex, yearFilter, { municipalityNames: stats.municipalities.map((item) => item.name) }, stats.municipalities),
          })),
        };
      }),
    } : null,
    document: { version: 1, activeScenarioId: scenarios.some((scenario) => scenario.id === context.document.activeScenarioId) ? context.document.activeScenarioId : scenarios[0]?.id, scenarios },
  }, null, 2);
}

function regionRows(context: ExportContext): Cell[][] {
  const header: Cell[] = ['Skenaario', 'Numero', 'Nimi', 'Lyhenne', 'Kuvaus', 'Väri', 'Läpinäkyvyys %', 'Käytössä', 'Näkyvissä', 'Kuntia', 'Seuroja', 'Jäseniä', 'Äänet', 'Pinta-ala km²', 'Osuus Suomesta %', 'Seuroja / 1000 km²', 'Jäseniä / 1000 km²', 'Kunnat', 'Väestö 2025', 'Osuus Suomen väestöstä %', 'Kuntaväestön keskiarvo', 'Kuntaväestön mediaani', 'Väestöltään suurin kunta', 'Väestöltään pienin kunta', 'Seuroja / 10000 asukasta', 'Jäseniä / 10000 asukasta', 'Asukkaita / km²'];
  const rows: Cell[][] = [header];
  for (const scenario of scenariosFor(context)) {
    const analysis = analyzeScenario(scenario.regions, context.dataset, context.placements, context.competitions);
    for (const region of scenario.regions) {
      const stats = analysis.stats.get(region.id);
      rows.push([scenario.name, region.number, region.name, region.shortName, region.description, region.color, Math.round(region.opacity * 100), region.enabled, region.visible,
        stats?.municipalityCount ?? 0, stats?.clubCount ?? 0, stats?.members ?? 0, stats?.votes ?? 0, round(stats?.areaKm2 ?? 0, 1), round((stats?.areaShare ?? 0) * 100),
        round((stats?.clubsPerKm2 ?? 0) * 1000, 3), round((stats?.membersPerKm2 ?? 0) * 1000, 2), stats?.municipalities.map((municipality) => municipality.name).join(', ') ?? '',
        stats?.population ?? null, stats?.populationShare != null ? round(stats.populationShare * 100) : null,
        stats?.averagePopulation ?? null, stats?.medianPopulation ?? null, stats?.largestMunicipality?.name ?? '', stats?.smallestMunicipality?.name ?? '',
        stats?.clubsPer10000 ?? null, stats?.membersPer10000 ?? null, stats?.populationDensity ?? null,
        stats?.competitionCount ?? null, stats?.competitionsPer10000 ?? null, stats?.competitionsPer1000Km2 ?? null,
        describeCompetitionYears(context.competitions?.yearFilter ?? { mode: 'all' })]);
    }
  }
  rows[0].push('Kilpailuja', 'Kilpailuja / 10000 asukasta', 'Kilpailuja / 1000 km²', 'Kilpailuvuodet');
  return rows;
}

function membershipRows(context: ExportContext): Cell[][] {
  const counts = new Map<string, { clubs: number; members: number; votes: number }>();
  for (const { club, municipalityCode } of context.placements) {
    if (!municipalityCode) continue;
    const entry = counts.get(municipalityCode) ?? { clubs: 0, members: 0, votes: 0 };
    entry.clubs += 1; entry.members += club.jasenmaara ?? 0; entry.votes += club.aanimaara ?? 0;
    counts.set(municipalityCode, entry);
  }
  const rows: Cell[][] = [['Skenaario', 'Aluenumero', 'Alue', 'Lyhenne', 'Väri', 'Läpinäkyvyys %', 'Käytössä', 'Näkyvissä', 'Kuntakoodi', 'Kunta', 'Maakunta', 'Pinta-ala km²', 'Seuroja', 'Jäseniä', 'Äänet', 'Väestö 2025', 'Suomen väestösijoitus', 'Väestöluokka', 'Seuroja / 10000 asukasta', 'Jäseniä / 10000 asukasta']];
  const years = describeCompetitionYears(context.competitions?.yearFilter ?? { mode: 'all' });
  const competitionStats = context.competitions?.index ? getCompetitionStatistics(context.competitions.index, context.competitions.yearFilter) : null;
  const competitionCounts = new Map(competitionStats?.municipalities.map((item) => [normalizeMunicipalityName(item.name), item.count]));
  for (const scenario of scenariosFor(context)) {
    for (const region of scenario.regions) {
      const base: Cell[] = [scenario.name, region.number, region.name, region.shortName, region.color, Math.round(region.opacity * 100), region.enabled, region.visible];
      if (region.municipalityCodes.length === 0) rows.push([...base, '', '', '', '', 0, 0, 0, null, null, '', null, null, competitionStats ? 0 : null, null, null, years]);
      for (const code of new Set(region.municipalityCodes)) {
        const municipality = context.dataset.byCode.get(code);
        const count = counts.get(code);
        const competitionCount = competitionStats && municipality ? competitionCounts.get(normalizeMunicipalityName(municipality.name)) ?? 0 : null;
        rows.push([...base, code, municipality?.name ?? 'Tuntematon kunta', municipality?.province ?? '', round(municipality?.areaKm2 ?? 0, 1), count?.clubs ?? 0, count?.members ?? 0, count?.votes ?? 0,
          municipality?.population ?? null, municipality ? getMunicipalityRank(municipality.name) : null, getPopulationCategory(municipality?.population ?? null)?.label ?? '',
          per10000Residents(count?.clubs ?? 0, municipality?.population ?? null),
          per10000Residents(count?.members ?? 0, municipality?.population ?? null),
          competitionCount, per10000Residents(competitionCount, municipality?.population ?? null),
          competitionCount !== null && municipality && municipality.areaKm2 > 0 ? competitionCount / municipality.areaKm2 * 1000 : null, years]);
      }
    }
  }
  rows[0].push('Kilpailuja', 'Kilpailuja / 10000 asukasta', 'Kilpailuja / 1000 km²', 'Kilpailuvuodet');
  return rows;
}

function metadataRows(context: ExportContext): Cell[][] {
  const scenarios = scenariosFor(context);
  return [
    ['Tieto', 'Arvo'],
    ['Muoto', DOCUMENT_FORMAT], ['Versio', 1], ['Viety', (context.exportedAt ?? new Date()).toISOString()],
    ['Laajuus', context.scope === 'all' ? 'Kaikki skenaariot' : 'Aktiivinen skenaario'],
    ['Skenaariot', scenarios.map((scenario) => scenario.name).join(', ')],
    ['Aktiivinen skenaario', activeScenario(context.document).name],
    ['Seuroja aineistossa', context.placements.length],
    ['Seura-aineisto päivitetty', context.clubMetadata?.generatedAt ?? ''],
    ['Kuntarajat', context.dataset.source ?? ''], ['Kuntarajojen lisenssi', context.dataset.license ?? ''],
    ['Suomen pinta-ala km² (kuntarajoista)', round(context.dataset.totalAreaKm2, 0)],
    ['Väestövuosi', populationService.year], ['Suomen väestö', getDatasetPopulation(context.dataset).total],
    ['Väestöaineiston lähde', 'Käyttäjän toimittama; alkuperäinen lähde ja viitepäivä ilmoittamatta'],
    ['Väestön kattavuus', 'Kokonaissummissa kukin kunta kerran; aluekohtaisissa riveissä päällekkäisyys sallittu'],
    ['Kilpailuaineisto', COMPETITION_FILE],
    ['Kilpailuvuodet', describeCompetitionYears(context.competitions?.yearFilter ?? { mode: 'all' })],
    ['Kilpailujen kattavuus', 'Aineistorivi = kilpailu; aluekohtainen päällekkäisyys sallittu; väestötiheydet käyttävät vuotta 2025'],
    ['Kilpailuja valittuina vuosina', context.competitions?.index ? getCompetitionStatistics(context.competitions.index, context.competitions.yearFilter).total : null],
  ];
}

/** Neutralises spreadsheet formula injection in text cells. */
export const csvCell = (cell: Cell) => {
  if (cell === null) return '';
  let value = typeof cell === 'number' ? String(cell).replace('.', ',') : typeof cell === 'boolean' ? (cell ? 'kyllä' : 'ei') : cell;
  if (typeof cell === 'string' && /^[=+\-@\t\r]/.test(value)) value = `'${value}`;
  return /[;"\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
};

export function exportCsv(context: ExportContext): string {
  return `\uFEFF${membershipRows(context).map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

export function exportXlsx(context: ExportContext): Uint8Array {
  const sheets: Sheet[] = [
    { name: 'Alueet', rows: regionRows(context) },
    { name: 'Aluekunnat', rows: membershipRows(context) },
    { name: 'Metatiedot', rows: metadataRows(context) },
  ];
  if (context.competitions?.index) {
    const stats = getCompetitionStatistics(context.competitions.index, context.competitions.yearFilter, {}, context.dataset.municipalities);
    sheets.push(...competitionSheets(stats));
  }
  return createWorkbook(sheets);
}

export function competitionSheets(stats: CompetitionStatistics): Sheet[] {
  return [
    { name: 'Kilpailuvuodet', rows: [
      ['Vuosi', 'Kilpailuja', 'Aktiivisia kuntia', 'Vuosimuutos', 'Vuosimuutos %', 'Uusia kuntia', 'Uudet kunnat'],
      ...stats.byYear.map((row) => [row.year, row.count, row.municipalityCount, row.change, row.changePercent, row.newMunicipalities.length, row.newMunicipalities.join(', ')]),
    ] },
    { name: 'Kilpailukunnat', rows: [
      ['Sijoitus', 'Kunta', 'Kilpailuja', 'Osuus %', 'Aktiivisia valittuja vuosia', 'Ensimmäinen aineistovuosi', 'Kilpailuja / 10000 as. (2025)', 'Kilpailuja / 1000 km²', ...stats.selectedYears],
      ...stats.municipalities.map((row) => [row.rank, row.name, row.count, row.share * 100, row.activeYears, row.firstYear, row.per10000Residents, row.per1000Km2, ...row.byYear.map((year) => year.count)]),
    ] },
    { name: 'Kilpailujakauma', rows: [['Kilpailumäärä', 'Aktiivisia kuntia'], ...stats.distribution.map((row) => [row.label, row.count])] },
  ];
}

export function exportCompetitionCsv(stats: CompetitionStatistics): string {
  const rows: Cell[][] = [
    ['Kunta', 'Vuosi', 'Kilpailuja', 'Kunnan kilpailuja valittuina vuosina', 'Sijoitus valituissa vuosissa', 'Uusi kunta aineistossa', 'Kilpailuja / 10000 as. (2025)', 'Kilpailuja / 1000 km²'],
    ...stats.municipalities.flatMap((row) => row.byYear.map((year) => [row.name, year.year, year.count, row.count, row.rank, year.year === row.firstYear, row.per10000Residents, row.per1000Km2])),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

export function exportFileName(extension: string, at = new Date()): string {
  return `aluesuunnitelma-${at.toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${extension}`;
}
