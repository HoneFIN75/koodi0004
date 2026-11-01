import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { unzipSync, strFromU8 } from 'fflate';
import { COMPETITION_FILE } from '../src/models/competition.ts';
import { createCompetitionRepository } from '../src/data/competitionRepository.ts';
import { compareCompetitionYears, competitionCountForMunicipalities, filterCompetitions, getCompetitionStatistics, indexCompetitions, parseCompetitions, selectedCompetitionYears } from '../src/services/competitionService.ts';
import { parseMunicipalities } from '../src/data/municipalityRepository.ts';
import { analyzeScenario } from '../src/services/regionAnalytics.ts';
import { createDocument, createRegion } from '../src/services/plannerDocument.ts';
import { exportCompetitionCsv, exportCsv, exportJson, exportXlsx } from '../src/services/exportService.ts';

const row = (name, year, municipality) => ({ 'Kilpailun nimi': name, Vuosi: year, Kunta: municipality });
const records = [row('Same name', 2020, 'Espoo'), row('Same name', 2020, 'Espoo'),
  row('B', 2021, 'Helsinki'), row('A', 2022, 'Espoo'), row('B', 2022, 'Helsinki'),
  row('C', 2024, 'Turku'), row('A', 2024, 'Espoo')];
const index = indexCompetitions(parseCompetitions(records));
const all = { mode: 'all' };
const dataset = parseMunicipalities(JSON.parse(await readFile(new URL('../public/geo/kunnat.geojson', import.meta.url), 'utf8')));

test('the supplied dataset is consumed unchanged, including duplicate rows and future years', async () => {
  const payload = JSON.parse(await readFile(new URL(`../${COMPETITION_FILE}`, import.meta.url), 'utf8'));
  const actual = indexCompetitions(parseCompetitions(payload));
  assert.equal(actual.records.length, payload.length);
  assert.ok(payload.length > 0);
  assert.equal(payload.some((competition) => competition.Vuosi === 2019), false);
  assert.equal(payload.some((competition) => competition['Kilpailun nimi'] === 'Karkkilan Pikkujoulu'), false);
  assert.deepEqual(actual.records, payload);
  assert.deepEqual(Object.fromEntries(actual.years.map((year) => [year, actual.byYear.get(year).length])),
    payload.reduce((counts, row) => ({ ...counts, [row.Vuosi]: (counts[row.Vuosi] ?? 0) + 1 }), {}));
  const stats = getCompetitionStatistics(actual, all, {}, dataset.municipalities);
  assert.equal(stats.total, payload.length);
  assert.equal(stats.municipalities.reduce((sum, item) => sum + item.count, 0), stats.total);
  assert.equal(stats.byYear.reduce((sum, item) => sum + item.count, 0), stats.total);
  const futureYear = actual.years.at(-1) + 1;
  const extended = indexCompetitions([...actual.records, row('Future competition', futureYear, '__future_test_municipality__')]);
  assert.equal(getCompetitionStatistics(extended, { mode: 'selected', years: [futureYear] }).total, 1);
  assert.deepEqual(getCompetitionStatistics(extended, all).byYear.at(-1).newMunicipalities, ['__future_test_municipality__']);
});

test('malformed data is rejected explicitly rather than silently dropping or coercing records', () => {
  for (const invalid of [null, {}, { data: records }, '[]']) assert.throws(() => parseCompetitions(invalid), /JSON-taulukko/);
  for (const invalid of [null, [], {}, row('', 2025, 'Espoo'), row('A', '2025', 'Espoo'), row('A', 2025.5, 'Espoo'), row('A', Infinity, 'Espoo'), row('A', 0, 'Espoo'), row('A', 2025, '')]) {
    assert.throws(() => parseCompetitions([records[0], invalid]), /rivi 2/);
  }
});

test('all, single, non-consecutive multiple, range, empty and absent year selections share filtering', () => {
  for (const [filter, expected] of [
    [all, 7], [{ mode: 'selected', years: [2020] }, 2],
    [{ mode: 'selected', years: [2024, 2020, 2020] }, 4],
    [{ mode: 'range', from: 2021, to: 2022 }, 3],
    [{ mode: 'selected', years: [] }, 0], [{ mode: 'selected', years: [2030] }, 0],
  ]) {
    const filtered = filterCompetitions(index, filter);
    const stats = getCompetitionStatistics(index, filter);
    assert.equal(filtered.length, expected);
    assert.equal(stats.total, expected);
    assert.equal(stats.byYear.reduce((sum, row) => sum + row.count, 0), expected);
    assert.equal(stats.municipalities.reduce((sum, row) => sum + row.count, 0), expected);
    assert.equal(stats.distribution.reduce((sum, row) => sum + row.count, 0), stats.municipalityCount);
  }
  assert.deepEqual(selectedCompetitionYears(index, { mode: 'selected', years: [2024, 2020, 2024] }), [2020, 2024]);
  for (const filter of [{ mode: 'range', from: 2025, to: 2020 }, { mode: 'range', from: NaN, to: 2020 }, { mode: 'selected', years: [2.5] }]) {
    assert.throws(() => getCompetitionStatistics(index, filter), /Vuosisuodatin/);
  }
  assert.deepEqual(getCompetitionStatistics(index, { mode: 'selected', years: [2030] }).byYear[0], {
    year: 2030, count: 0, municipalityCount: 0, newMunicipalities: [], change: null, changePercent: null,
  });
});

test('municipality scopes intersect and deduplicate, preserving all occurrences', () => {
  const filter = { mode: 'selected', years: [2020, 2024] };
  assert.equal(competitionCountForMunicipalities(index, filter, [' ESPOO ', 'Espoo']), 3);
  assert.equal(competitionCountForMunicipalities(null, filter, ['Espoo']), null);
  assert.equal(getCompetitionStatistics(index, filter, { municipality: 'espoo' }).total, 3);
  assert.equal(getCompetitionStatistics(index, filter, { municipality: 'Helsinki', municipalityNames: ['Espoo'] }).total, 0);
  assert.equal(getCompetitionStatistics(index, filter, { municipalityNames: [] }).total, 0);
  assert.equal(getCompetitionStatistics(index, filter, { municipality: 'Helsinki' }).byYear[0].count, 0);
});

test('new municipalities use full history while growth uses only selected adjacent years', () => {
  const stats = getCompetitionStatistics(index, { mode: 'selected', years: [2021, 2022, 2024] });
  assert.deepEqual(stats.byYear.map((row) => row.newMunicipalities), [['Helsinki'], [], ['Turku']]);
  assert.deepEqual(stats.byYear.map((row) => row.change), [null, 1, null]);
  assert.deepEqual(stats.byYear.map((row) => row.changePercent), [null, 100, null]);
  assert.deepEqual(compareCompetitionYears(stats.byYear, 2021, 2024), { from: 2021, to: 2024, change: 1, changePercent: 100 });
  assert.throws(() => compareCompetitionYears(stats.byYear, 2020, 2024), /aktiiviseen/);
  const zero = getCompetitionStatistics(index, { mode: 'selected', years: [2023, 2024] });
  assert.equal(zero.byYear[1].change, 2);
  assert.equal(zero.byYear[1].changePercent, null);
});

test('rankings, distributions, density and participation account for selection and missing denominators', () => {
  const stats = getCompetitionStatistics(index, all, {}, dataset.municipalities);
  assert.deepEqual(stats.municipalities.map((row) => [row.name, row.count, row.rank]), [['Espoo', 4, 1], ['Helsinki', 2, 2], ['Turku', 1, 3]]);
  assert.deepEqual(stats.municipalities[0].byYear.map((row) => row.count), [2, 0, 1, 1]);
  assert.equal(stats.municipalities[0].activeYears, 3);
  const espoo = dataset.municipalities.find((row) => row.name === 'Espoo');
  assert.equal(stats.municipalities[0].per10000Residents, 4 / espoo.population * 10000);
  assert.equal(stats.municipalities[0].per1000Km2, 4 / espoo.areaKm2 * 1000);
  assert.equal(getCompetitionStatistics(index, all).municipalities[0].per1000Km2, null);
  const tied = getCompetitionStatistics(index, { mode: 'selected', years: [2022] });
  assert.deepEqual(tied.municipalities.map((row) => row.rank), [1, 1]);
  assert.equal(tied.municipalities.reduce((sum, row) => sum + row.share, 0), 1);
});

test('scenario, region and unassigned statistics use the same years without overlap inflation', () => {
  const code = (name) => dataset.municipalities.find((item) => item.name === name).code;
  const region = (names, enabled = true) => ({ ...createRegion([]), enabled, municipalityCodes: names.map(code) });
  const regions = [region(['Espoo', 'Espoo']), region(['Espoo', 'Helsinki']), region(['Turku'], false)];
  const competitions = { index: indexCompetitions([...records, row('Unknown', 2024, 'Unknown municipality')]), yearFilter: { mode: 'selected', years: [2020, 2024] } };
  const analysis = analyzeScenario(regions, dataset, [], competitions);
  assert.equal(analysis.totals.competitionCount, 5);
  assert.equal(analysis.totals.assignedCompetitions, 3);
  assert.equal(analysis.totals.unassignedCompetitions, 1);
  assert.deepEqual(analysis.totals.unmatchedCompetitionMunicipalities, ['Unknown municipality']);
  assert.deepEqual([...analysis.stats.values()].map((stats) => stats.competitionCount), [3, 3, 1]);
  assert.equal(analysis.unassigned.find((row) => row.municipality.name === 'Turku').competitionCount, 1);
  const noData = analyzeScenario(regions, dataset, []);
  assert.equal(noData.totals.competitionCount, null);
  assert.equal(noData.stats.get(regions[0].id).competitionCount, null);
});

test('repository reloads the runtime URL without HTTP caching and propagates errors', async () => {
  let calls = 0;
  const repository = createCompetitionRepository('/subdirectory/jsondb/competitions.json', async (url, options) => {
    assert.equal(url, '/subdirectory/jsondb/competitions.json');
    assert.equal(options.cache, 'no-store');
    calls += 1;
    return Response.json(calls === 1 ? records : [...records, row('New', 2027, 'Espoo')]);
  });
  assert.equal((await repository.getIndex()).records.length, 7);
  assert.equal((await repository.getIndex()).records.length, 8);
  for (const [response, message] of [[new Response('', { status: 404 }), /HTTP 404/], [new Response('broken'), /kelvollista JSONia/], [Response.json({}), /JSON-taulukko/]]) {
    await assert.rejects(createCompetitionRepository('/test', async () => response).getIndex(), message);
  }
});

test('JSON, CSV and XLSX competition exports retain active years and round-trip planning data', () => {
  const document = createDocument();
  const espoo = dataset.municipalities.find((row) => row.name === 'Espoo');
  document.scenarios[0].regions = [{ ...createRegion([]), municipalityCodes: [espoo.code] }];
  const competitions = { index, yearFilter: { mode: 'selected', years: [2020, 2024] } };
  const context = { document, dataset, placements: [], scope: 'active', clubMetadata: null, competitions };
  const exported = JSON.parse(exportJson(context));
  assert.deepEqual(exported.document, document);
  assert.deepEqual(exported.metadata.competitions.yearFilter, competitions.yearFilter);
  assert.equal(exported.competitionAnalytics.total, 4);
  assert.deepEqual(exported.competitionAnalytics.byYear.map((row) => row.year), [2020, 2024]);
  assert.equal(exported.competitionAnalytics.scenarios[0].regions[0].total, 3);
  const csv = exportCsv(context).split('\r\n');
  assert.match(csv[0], /Kilpailuja/);
  assert.match(csv[1], /;3;[^;]+;[^;]+;2020, 2024$/);
  const workbook = unzipSync(exportXlsx(context));
  assert.match(strFromU8(workbook['xl/workbook.xml']), /Kilpailuvuodet/);
  assert.match(strFromU8(workbook['xl/worksheets/sheet4.xml']), />2020<.*>2024</s);
  assert.doesNotMatch(strFromU8(workbook['xl/worksheets/sheet4.xml']), />2021</);
  const safeStats = getCompetitionStatistics(indexCompetitions([row('X', 2024, '=EVIL()')]), all);
  assert.match(exportCompetitionCsv(safeStats), /'=EVIL\(\)/);
  assert.deepEqual(JSON.parse(exportJson({ ...context, competitions: undefined })).competitionAnalytics, null);
});
