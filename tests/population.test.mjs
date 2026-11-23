import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { unzipSync, strFromU8 } from 'fflate';
import { parseMunicipalities } from '../src/data/municipalityRepository.ts';
import { populationService, createPopulationService, getCoveragePopulation, getPopulationCategory, getDatasetPopulation, matchesPopulation, summarizePopulation } from '../src/services/populationService.ts';
import { analyzeScenario, aggregateByMunicipality, computeRegionStats, filterPlacements, emptyFilters } from '../src/services/regionAnalytics.ts';
import { createDocument, createRegion } from '../src/services/plannerDocument.ts';
import { exportCsv, exportJson, exportXlsx } from '../src/services/exportService.ts';

const dataset = parseMunicipalities(JSON.parse(await readFile(new URL('../public/geo/kunnat.geojson', import.meta.url), 'utf8')));
const municipality = (name) => dataset.municipalities.find((item) => item.name === name);
const region = (names) => ({ ...createRegion([]), municipalityCodes: names.map((name) => municipality(name).code) });

test('population source is complete, integral, cached and matched to every bilingual boundary', async () => {
  assert.equal(populationService.municipalities.length, 308);
  assert.equal(populationService.getNationalPopulation(), 5_652_881);
  assert.deepEqual(populationService.warnings, []);
  assert.equal((await import('../src/services/populationService.ts')).populationService, populationService);
  assert.equal(getDatasetPopulation(dataset), getDatasetPopulation(dataset));
  for (const item of dataset.municipalities) {
    assert.ok(Number.isSafeInteger(item.population), item.name);
    assert.equal(populationService.getMunicipalityPopulation(item.name.toUpperCase()), item.population);
    if (item.nameSv) assert.equal(populationService.getMunicipalityPopulation(item.nameSv), item.population, item.nameSv);
  }
  assert.equal(populationService.getMunicipalityPopulation('  HELSINGFORS  '), 694392);
  assert.equal(populationService.getMunicipalityPopulation('A\u0308hta\u0308ri'), municipality('Ähtäri').population);
  assert.equal(populationService.getMunicipalityPopulation('Unknown municipality'), null);
  assert.equal(populationService.getMunicipalityRank('Unknown municipality'), null);
  assert.equal(getDatasetPopulation(dataset).total, populationService.getNationalPopulation());
});

test('all eight population category thresholds are exact and missing values remain unknown', () => {
  for (const [population, id] of [[0, 'very-small'], [1999, 'very-small'], [2000, 'small-municipality'], [4999, 'small-municipality'], [5000, 'municipality'], [9999, 'municipality'], [10000, 'large-municipality'], [19999, 'large-municipality'], [20000, 'small-city'], [49999, 'small-city'], [50000, 'medium-city'], [99999, 'medium-city'], [100000, 'large-city'], [199999, 'large-city'], [200000, 'mega']]) {
    assert.equal(getPopulationCategory(population)?.id, id, String(population));
  }
  for (const invalid of [null, NaN, Infinity, -1, 1.5]) assert.equal(getPopulationCategory(invalid), null);
});

test('population quality checks report invalid, duplicate and mismatched metadata rows', () => {
  assert.throws(() => createPopulationService({}), /rakenne/);
  const service = createPopulationService({
    metadata: { country: 'Finland', populationYear: 2025, municipalityCount: 3 },
    municipalities: [{ name: 'Test', population: 5000 }, { name: 'TEST', population: 2 }, { name: 'Invalid', population: -1 }],
  });
  assert.equal(service.getMunicipalityPopulation('test'), 5000);
  assert.equal(service.warnings.length, 3);
  const tied = createPopulationService({
    metadata: { country: 'Finland', populationYear: 2025, municipalityCount: 3 },
    municipalities: [{ name: 'A', population: 10 }, { name: 'B', population: 10 }, { name: 'C', population: 5 }],
  });
  assert.equal(tied.getMunicipalityRank('A'), 1);
  assert.equal(tied.getMunicipalityRank('B'), 1);
  assert.equal(tied.getMunicipalityRank('C'), 3);
  assert.deepEqual(tied.getLargestMunicipalities(2).map((item) => item.name), ['A', 'B']);
  assert.equal(tied.getSmallestMunicipalities(1)[0].name, 'C');
});

test('regional sums, mean, median, extrema and per-capita metrics deduplicate municipality codes', () => {
  const area = region(['Helsinki', 'Espoo', 'Espoo']);
  const club = { seura: 'Test', paikkakunta: 'Espoo', jasenmaara: 100, aanimaara: 10, details: {}, latitude: null, longitude: null };
  const placements = [{ club, municipalityCode: municipality('Espoo').code, method: 'name' }];
  const stats = computeRegionStats(area, dataset, aggregateByMunicipality(placements, dataset));
  assert.equal(stats.population, 1_020_108);
  assert.equal(stats.averagePopulation, 510054);
  assert.equal(stats.medianPopulation, 510054);
  assert.equal(stats.largestMunicipality.name, 'Helsinki');
  assert.equal(stats.smallestMunicipality.name, 'Espoo');
  assert.equal(stats.populationShare, 1_020_108 / 5_652_881);
  assert.ok(Math.abs(stats.clubsPer10000 - 10000 / 1_020_108) < 1e-12);
  assert.ok(Math.abs(stats.membersPer10000 - 1000000 / 1_020_108) < 1e-12);
  assert.equal(stats.populationDensity, 1_020_108 / stats.areaKm2);
  const document = createDocument();
  document.scenarios[0].regions = [area];
  assert.equal(populationService.getRegionPopulation(area.id, document, dataset), stats.population);
  assert.equal(populationService.getRegionPopulation('missing', document, dataset), null);
});

test('coverage union excludes disabled regions and never double counts overlapping populations', () => {
  const first = region(['Helsinki', 'Espoo']);
  const second = region(['Espoo', 'Turku']);
  const disabled = { ...region(['Tampere']), enabled: false };
  const analysis = analyzeScenario([first, second, disabled], dataset, []);
  const expected = municipality('Helsinki').population + municipality('Espoo').population + municipality('Turku').population;
  assert.equal(analysis.totals.assignedPopulation, expected);
  assert.equal(analysis.totals.assignedPopulation + analysis.totals.unassignedPopulation, 5_652_881);
  assert.equal(analysis.totals.clubMunicipalityPopulation, 0);
});

test('unknown population and unknown codes reject complete totals rather than silently becoming zero', () => {
  const unknown = { ...dataset, municipalities: dataset.municipalities.map((item) => item.name === 'Espoo' ? { ...item, population: null } : item) };
  unknown.byCode = new Map(unknown.municipalities.map((item) => [item.code, item]));
  const stats = computeRegionStats(region(['Helsinki', 'Espoo']), unknown, new Map());
  assert.equal(stats.population, null);
  assert.equal(stats.populationShare, null);
  assert.equal(stats.membersPer10000, null);
  assert.equal(summarizePopulation([{ name: 'A', population: 0 }, { name: 'B', population: null }]).total, null);
  assert.equal(summarizePopulation([]).total, 0);
  assert.equal(computeRegionStats({ ...region(['Helsinki']), municipalityCodes: ['unknown'] }, dataset, new Map()).population, null);
  assert.equal(getCoveragePopulation([{ ...region(['Helsinki']), municipalityCodes: ['unknown'] }], dataset), null);
});

test('population ranges and categories include boundaries and exclude missing populations only when active', () => {
  assert.equal(matchesPopulation(null, {}), true);
  assert.equal(matchesPopulation(null, { minPopulation: 0 }), false);
  assert.equal(matchesPopulation(5000, { minPopulation: 5000, maxPopulation: 5000 }), true);
  assert.equal(matchesPopulation(5000, { minPopulation: 6000, maxPopulation: 4000 }), false);
  assert.equal(matchesPopulation(200000, { populationCategory: 'mega' }), true);
  const placements = ['Helsinki', 'Espoo', 'Turku', 'Brändö'].map((name) => ({
    club: { seura: name, paikkakunta: name, jasenmaara: 10, aanimaara: 10 }, municipalityCode: municipality(name).code, method: 'name',
  }));
  assert.equal(filterPlacements(placements, { ...emptyFilters, populationCategory: 'mega' }, dataset, []).length, 3);
  assert.equal(filterPlacements(placements, { ...emptyFilters, maxPopulation: 1999 }, dataset, []).length, 1);
});

test('JSON, CSV and XLSX export population calculations without changing the shared planner document', () => {
  const document = createDocument();
  document.scenarios[0].regions = [region(['Helsinki', 'Espoo'])];
  const before = JSON.stringify(document);
  const context = { document, dataset, placements: [], clubMetadata: null, scope: 'all' };
  const json = JSON.parse(exportJson(context));
  assert.equal(json.metadata.population.year, 2025);
  assert.equal(json.populationAnalytics[0].regions[0].population, 1_020_108);
  assert.match(exportCsv(context), /Väestö 2025/);
  assert.match(exportCsv(context), /694392/);
  const workbook = unzipSync(exportXlsx(context));
  assert.match(strFromU8(workbook['xl/worksheets/sheet1.xml']), /1020108/);
  assert.match(strFromU8(workbook['xl/worksheets/sheet2.xml']), /325716/);
  assert.equal(JSON.stringify(document), before);
});
