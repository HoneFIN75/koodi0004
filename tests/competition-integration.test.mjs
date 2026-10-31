import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { useCompetitionStore, defaultCompetitionFilters } from '../src/state/competitionStore.ts';
import { parseMunicipalities } from '../src/data/municipalityRepository.ts';
import { createCompetitionDataset } from '../src/data/competitionRepository.ts';
import { filterCompetitions } from '../src/services/competitionService.ts';
import { exportCompetitionJson, exportCompetitionCsv, competitionExportRows } from '../src/services/competitionExportService.ts';
import { exportJson, exportCsv, exportXlsx } from '../src/services/exportService.ts';
import { createDocument } from '../src/services/plannerDocument.ts';
import { createCompetitionScopeLookup } from '../src/services/competitionScopeService.ts';
import { formatCompetitionDivision } from '../src/services/competitionPresentation.ts';
import { unzipSync, strFromU8 } from 'fflate';

const municipalities = parseMunicipalities(JSON.parse(await readFile(new URL('../public/geo/kunnat.geojson', import.meta.url), 'utf8')));
const data = createCompetitionDataset(JSON.parse(await readFile(new URL('../public/data/SFL-Kilpailut_lopullinen.json', import.meta.url), 'utf8')), municipalities);

test('shared filters and selection survive component/route subscribers without altering planner content', () => {
  useCompetitionStore.getState().reset();
  assert.deepEqual(useCompetitionStore.getState().filters, defaultCompetitionFilters);
  const before = createDocument();
  useCompetitionStore.getState().setFilters({ visibility: 'years', years: [2023, 2025], municipality: 'Espoo' });
  useCompetitionStore.getState().select('selected');
  assert.equal(useCompetitionStore.getState().selectedId, 'selected');
  const publicFilters = useCompetitionStore.getState().filters;
  assert.deepEqual(publicFilters.years, [2023, 2025]);
  useCompetitionStore.getState().setFilters({ tier: 'C-tier' });
  assert.equal(useCompetitionStore.getState().selectedId, null);
  assert.deepEqual(before.scenarios[0].regions, []);
  useCompetitionStore.getState().setFilters({ visibility: 'years', years: [] });
  assert.equal(filterCompetitions(data, useCompetitionStore.getState().filters).length, 0);
  useCompetitionStore.getState().reset();
  assert.equal(useCompetitionStore.getState().filters.visibility, 'hidden');
});

test('competition CSV/JSON exports retain one record per event, locations, issues and active filters', () => {
  const filters = { ...defaultCompetitionFilters, visibility: 'years', years: [2023, 2025] };
  const competitions = filterCompetitions(data, filters);
  const exported = JSON.parse(exportCompetitionJson(competitions, filters));
  assert.equal(exported.uniqueCount, competitions.length);
  assert.deepEqual(exported.filters.years, [2023, 2025]);
  assert.equal(new Set(exported.competitions.map((item) => item.id)).size, competitions.length);
  const multi = competitions.find((item) => item.municipalities.length > 1);
  assert.ok(multi);
  assert.equal(exported.competitions.find((item) => item.id === multi.id).municipalities.length, multi.municipalities.length);
  assert.equal(competitionExportRows(competitions).length, competitions.length + 1);
  const csv = exportCompetitionCsv([{ ...multi, name: ' =HYPERLINK("malicious")' }]);
  assert.ok(csv.includes("\"' =HYPERLINK(\"\"malicious\"\")\""));
  assert.ok(csv.startsWith('\uFEFF'));
});

test('planner exports carry filtered analytics without copying reference events into saved documents', () => {
  const document = createDocument();
  const region = { id: 'test', number: 1, name: 'Testialue', shortName: 'Testi', description: '', color: '#000000', opacity: 0.3, enabled: true, visible: true, municipalityCodes: ['091', '049'], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
  document.scenarios[0].regions.push(region);
  const filters = { ...defaultCompetitionFilters, visibility: 'years', years: [2025] };
  const competitions = filterCompetitions(data, filters);
  const context = { document, dataset: municipalities, placements: [], clubMetadata: null, scope: 'active', competitions, competitionFilters: filters };
  const json = JSON.parse(exportJson(context));
  assert.deepEqual(json.document.scenarios, document.scenarios);
  assert.equal(json.competitionAnalytics[0].uniqueCount, competitions.length);
  assert.deepEqual(json.competitionAnalytics[0].filters.years, [2025]);
  assert.ok(!('competitions' in json.document));
  assert.ok(!('competitions' in json));
  const csv = exportCsv(context);
  assert.ok(csv.includes('Ensisijaiset kilpailut'));
  assert.ok(csv.includes('Liittyvät yksilölliset kilpailut'));
  assert.ok(csv.includes('competition') === false);
  const zip = unzipSync(exportXlsx(context));
  const workbook = strFromU8(zip['xl/workbook.xml']);
  assert.ok(workbook.includes('Kilpailut'));
  assert.equal(document.scenarios[0].regions[0].municipalityCodes.length, 2);
});

test('scope indexes cache equivalent overlapping unions and keep host counts separate from associations', () => {
  const filters = { ...defaultCompetitionFilters, visibility: 'all' };
  const competitions = filterCompetitions(data, filters);
  const scopeFor = createCompetitionScopeLookup(competitions, municipalities);
  assert.equal(scopeFor(['091', '049']), scopeFor(['049', '091', '091']));
  const result = scopeFor(['091', '049']);
  assert.equal(result.associated.length, new Set(result.associated.map((item) => item.id)).size);
  assert.ok(result.associated.length >= result.primary.length);
  assert.equal(result.population, municipalities.byCode.get('091').population + municipalities.byCode.get('049').population);
  assert.equal(scopeFor(['unknown']).population, null);
  assert.equal(scopeFor([]).associated.length, 0);
});

test('every supplied division classification has a Finnish presentation without overwriting the source', () => {
  assert.equal(formatCompetitionDivision('mixed'), 'Pro- ja amatööriluokat');
  assert.equal(formatCompetitionDivision('pro'), 'Pro-luokat');
  assert.equal(formatCompetitionDivision('amateur'), 'Amatööriluokat');
  assert.match(formatCompetitionDivision('Pro- ja amatööriluokat, Vain pro-luokkia'), /ristiriitainen/);
  for (const competition of data.competitions) assert.ok(!formatCompetitionDivision(competition.divisionType).includes('Ratings based divisions'));
});
