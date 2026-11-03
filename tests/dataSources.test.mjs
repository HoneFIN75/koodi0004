import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parseDatabase } from '../src/data/clubRepository.ts';
import { parseMunicipalities } from '../src/data/municipalityRepository.ts';
import { parseProvinceDataset } from '../src/data/provinceRepository.ts';
import { indexCompetitions, parseCompetitions } from '../src/services/competitionService.ts';
import { getDataSourceMetadata, latestSourceTimestamp } from '../src/services/dataSourceService.ts';

const load = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const emptySnapshot = { clubs: null, competitions: null, municipalities: null, provinces: null, planning: null };

test('source counts use loaded records, not source metadata or selected competition years', async () => {
  const clubs = parseDatabase({
    metadata: { generatedAt: '2026-01-01T00:00:00Z', source: 'test', recordCount: 999 },
    data: [{ seura: 'Seura', paikkakunta: 'Helsinki', jasenmaara: 42 }],
  });
  const competitions = indexCompetitions(parseCompetitions([
    { 'Kilpailun nimi': 'A', Vuosi: 2024, Kunta: 'Helsinki' },
    { 'Kilpailun nimi': 'B', Vuosi: 2025, Kunta: 'Helsinki' },
  ]));
  const municipalities = parseMunicipalities(await load('../public/geo/kunnat.geojson'));
  const provinces = parseProvinceDataset(await load('../jsondb/regions.json'));
  const metadata = getDataSourceMetadata({ ...emptySnapshot, clubs, competitions, municipalities, provinces }, 308);
  assert.equal(metadata.clubs.recordCount, 1);
  assert.equal(metadata.competitions.recordCount, 2);
  assert.deepEqual(metadata.competitions.years, [2024, 2025]);
  assert.equal(metadata.municipalities.recordCount, 308);
  assert.equal(metadata.provinces.recordCount, 19);
  assert.equal(metadata.population.recordCount, 308);
  assert.equal(metadata.clubs.lastUpdatedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(metadata.municipalities.lastUpdatedAt, municipalities.generatedAt);
  assert.equal(metadata.competitions.lastUpdatedAt, undefined);
});

test('planning counts all scenario regions, including disabled and separately copied regions', () => {
  const planning = {
    scenarios: [
      { regions: [{ id: 'one', enabled: false, updatedAt: '2026-01-01T00:00:00Z' }] },
      { regions: [{ id: 'two', updatedAt: '2026-02-01T00:00:00Z' }, { id: 'copy', updatedAt: 'invalid' }] },
    ],
  };
  const metadata = getDataSourceMetadata({ ...emptySnapshot, planning }, 308);
  assert.equal(metadata.planning.recordCount, 3);
  assert.equal(metadata.planning.lastUpdatedAt, '2026-02-01T00:00:00.000Z');
});

test('unavailable sources stay unknown while loaded empty data counts as zero', () => {
  const missing = getDataSourceMetadata(emptySnapshot, 308);
  for (const id of ['clubs', 'competitions', 'municipalities', 'provinces', 'planning']) {
    assert.equal(missing[id].recordCount, null);
  }
  const empty = getDataSourceMetadata({
    clubs: { data: [], metadata: {} }, competitions: { records: [] },
    municipalities: { municipalities: [] }, provinces: { regions: [] }, planning: { scenarios: [] },
  }, 0);
  for (const source of Object.values(empty)) assert.equal(source.recordCount, 0);
  assert.equal(latestSourceTimestamp(Object.values(empty).map((source) => source.lastUpdatedAt)), null);
});

test('latest source timestamp ignores invalid dates and normalizes time zones, never using the current time', () => {
  assert.equal(latestSourceTimestamp([null, undefined, '', 'not-a-date']), null);
  assert.equal(latestSourceTimestamp(['2026-01-01T12:00:00+02:00', '2026-01-01T10:30:00Z']), '2026-01-01T10:30:00.000Z');
});

test('municipality metadata validates generation timestamps without inventing dates', async () => {
  const input = await load('../public/geo/kunnat.geojson');
  const dataset = parseMunicipalities(input);
  assert.equal(dataset.generatedAt, input.metadata.generatedAt);
  input.metadata.generatedAt = 'invalid';
  assert.equal(parseMunicipalities(input).generatedAt, null);
  delete input.metadata.generatedAt;
  assert.equal(parseMunicipalities(input).generatedAt, null);
});
