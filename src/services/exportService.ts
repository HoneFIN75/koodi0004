import type { Database } from '../models/club';
import type { MunicipalityDataset, PlannerDocument, Scenario } from '../models/region';
import { DOCUMENT_FORMAT, activeScenario } from './plannerDocument.ts';
import { analyzeScenario, type ClubPlacement } from './regionAnalytics.ts';
import { createWorkbook, type Cell, type Sheet } from './xlsxWriter.ts';

export interface ExportContext {
  document: PlannerDocument;
  dataset: MunicipalityDataset;
  placements: ClubPlacement[];
  clubMetadata: Database['metadata'] | null;
  scope: 'all' | 'active';
  exportedAt?: Date;
}

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const scenariosFor = ({ document, scope }: ExportContext): Scenario[] => scope === 'all' ? document.scenarios : [activeScenario(document)];

export function exportJson(context: ExportContext): string {
  const scenarios = scenariosFor(context);
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
    },
    document: { version: 1, activeScenarioId: scenarios.some((scenario) => scenario.id === context.document.activeScenarioId) ? context.document.activeScenarioId : scenarios[0]?.id, scenarios },
  }, null, 2);
}

function regionRows(context: ExportContext): Cell[][] {
  const header: Cell[] = ['Skenaario', 'Numero', 'Nimi', 'Lyhenne', 'Kuvaus', 'Väri', 'Läpinäkyvyys %', 'Käytössä', 'Näkyvissä', 'Kuntia', 'Seuroja', 'Jäseniä', 'Äänet', 'Pinta-ala km²', 'Osuus Suomesta %', 'Seuroja / 1000 km²', 'Jäseniä / 1000 km²', 'Kunnat'];
  const rows: Cell[][] = [header];
  for (const scenario of scenariosFor(context)) {
    const analysis = analyzeScenario(scenario.regions, context.dataset, context.placements);
    for (const region of scenario.regions) {
      const stats = analysis.stats.get(region.id);
      rows.push([scenario.name, region.number, region.name, region.shortName, region.description, region.color, Math.round(region.opacity * 100), region.enabled, region.visible,
        stats?.municipalityCount ?? 0, stats?.clubCount ?? 0, stats?.members ?? 0, stats?.votes ?? 0, round(stats?.areaKm2 ?? 0, 1), round((stats?.areaShare ?? 0) * 100),
        round((stats?.clubsPerKm2 ?? 0) * 1000, 3), round((stats?.membersPerKm2 ?? 0) * 1000, 2), stats?.municipalities.map((municipality) => municipality.name).join(', ') ?? '']);
    }
  }
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
  const rows: Cell[][] = [['Skenaario', 'Aluenumero', 'Alue', 'Lyhenne', 'Väri', 'Läpinäkyvyys %', 'Käytössä', 'Näkyvissä', 'Kuntakoodi', 'Kunta', 'Maakunta', 'Pinta-ala km²', 'Seuroja', 'Jäseniä', 'Äänet']];
  for (const scenario of scenariosFor(context)) {
    for (const region of scenario.regions) {
      const base: Cell[] = [scenario.name, region.number, region.name, region.shortName, region.color, Math.round(region.opacity * 100), region.enabled, region.visible];
      if (region.municipalityCodes.length === 0) rows.push([...base, '', '', '', '', 0, 0, 0]);
      for (const code of region.municipalityCodes) {
        const municipality = context.dataset.byCode.get(code);
        const count = counts.get(code);
        rows.push([...base, code, municipality?.name ?? 'Tuntematon kunta', municipality?.province ?? '', round(municipality?.areaKm2 ?? 0, 1), count?.clubs ?? 0, count?.members ?? 0, count?.votes ?? 0]);
      }
    }
  }
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
  ];
}

/** Neutralises spreadsheet formula injection in text cells. */
const csvCell = (cell: Cell) => {
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
  return createWorkbook(sheets);
}

export function exportFileName(extension: string, at = new Date()): string {
  return `aluesuunnitelma-${at.toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${extension}`;
}
