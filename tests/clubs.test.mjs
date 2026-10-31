import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parseDatabase, clubRepository } from '../src/data/clubRepository.ts';
import { filterClubs, searchClubs } from '../src/services/searchService.ts';
import { getTotals, getVotingDistribution, getMembershipDistribution, getRegionalStats } from '../src/services/statisticsService.ts';
import { markerColor, markerRadius, hasLocation } from '../src/services/mapService.ts';

const record = (overrides = {}) => ({
  seura: 'Testiseura', paikkakunta: 'Jyväskylä', latitude: 62.24, longitude: 25.75,
  jasenmaara: 25, aanimaara: 10, ...overrides,
});
const payload = (data, metadata = {}) => ({
  metadata: { generatedAt: '2026-01-01T00:00:00Z', recordCount: data.length, source: 'test', ...metadata },
  data,
});
const clubs = (data) => parseDatabase(payload(data)).data;

test('actual repository database is accepted without warnings', async () => {
  const input = JSON.parse(await readFile(new URL('../jsondb/seurat.json', import.meta.url), 'utf8'));
  const database = parseDatabase(input);
  assert.equal(database.data.length, input.data.length);
  assert.deepEqual(database.warnings, []);
  assert.equal(database.data.filter(hasLocation).length, database.data.length);
});

test('processes every record regardless of stale metadata and future size', () => {
  for (const size of [0, 1, 600, 1200]) {
    const database = parseDatabase(payload(Array.from({ length: size }, (_, index) => record({ jasenmaara: index })), { recordCount: 5 }));
    assert.equal(database.data.length, size);
    assert.equal(getTotals(database.data).clubs, size);
    assert.equal(getTotals(database.data).members, size === 0 ? 0 : size * (size - 1) / 2);
    assert.ok(database.warnings.some((warning) => warning.includes('Metadata ilmoittaa')));
  }
});

test('missing values remain unknown, valid records are not discarded', () => {
  const database = parseDatabase({ data: [record(), {}, null, record({ latitude: 100, longitude: Infinity, jasenmaara: -1, aanimaara: '' })] });
  assert.equal(database.data.length, 3);
  assert.ok(database.warnings.length >= 3);
  assert.equal(database.data[1].jasenmaara, null);
  assert.equal(database.data[2].latitude, null);
  assert.equal(database.data.filter(hasLocation).length, 1);
  assert.equal(getTotals(database.data).average, 25);
  assert.equal(getTotals(database.data).knownMembers, 1);
  assert.equal(getVotingDistribution(database.data)[0].count, 1);
});

test('normalizes numeric strings, rejects non-finite, fractional and blank counts', () => {
  const data = clubs([
    record({ jasenmaara: '1\u00a0234', latitude: '62.24', aanimaara: '15' }),
    record({ jasenmaara: ' ', aanimaara: 15.5 }),
    record({ jasenmaara: Infinity, aanimaara: -10 }),
  ]);
  assert.equal(data[0].jasenmaara, 1234);
  assert.equal(data[0].latitude, 62.24);
  assert.equal(data[0].aanimaara, 15);
  assert.equal(data[1].jasenmaara, null);
  assert.equal(data[1].aanimaara, null);
  assert.equal(data[2].jasenmaara, null);
});

test('invalid structure throws; invalid dates and counts are reported', () => {
  for (const input of [null, [], {}, { data: {} }]) assert.throws(() => parseDatabase(input));
  const database = parseDatabase(payload([], { generatedAt: 'bad', recordCount: -1 }));
  assert.equal(database.metadata.generatedAt, null);
  assert.equal(database.metadata.recordCount, null);
  assert.equal(database.warnings.length, 1);
});

test('preserves extensible scalar details but not nested data', () => {
  const [club] = clubs([record({ region: 'Keski-Suomi', website: 'https://example.com', foundedYear: 1999, nested: {}, empty: '' })]);
  assert.deepEqual(club.details, { region: 'Keski-Suomi', website: 'https://example.com', foundedYear: 1999 });
  assert.equal(getRegionalStats([club])[0].name, 'Keski-Suomi');
});

test('mean, median, extrema and missing-member denominators are correct', () => {
  const data = clubs([record({ jasenmaara: 0 }), record({ jasenmaara: 20 }), record({ jasenmaara: 51 }), record({ jasenmaara: null })]);
  assert.equal(getTotals(data).average, 71 / 3);
  assert.equal(getTotals(data).median, 20);
  assert.equal(getTotals(data).smallest.jasenmaara, 0);
  assert.equal(getTotals(data).largest.jasenmaara, 51);
  assert.equal(getTotals(data.slice(0, 2)).median, 10);
  assert.equal(getTotals([]).median, null);
  assert.equal(getTotals([]).largest, null);
  assert.equal(getTotals([]).average, null);
});

test('membership bucket edges and all voting categories are accounted for', () => {
  const data = clubs([0, 25, 26, 75, 76, 150, 151, 300, 301, 10000].map((jasenmaara) => record({ jasenmaara })));
  assert.deepEqual(getMembershipDistribution(data).map((row) => row.count), [2, 2, 2, 2, 2]);
  assert.deepEqual(getVotingDistribution(clubs([record({ aanimaara: 25 }), record({ aanimaara: null })])), [
    { label: '10 ääntä', count: 0 }, { label: '15 ääntä', count: 0 },
    { label: '20 ääntä', count: 0 }, { label: '25 ääntä', count: 1 },
  ]);
});

test('composed filters instantly produce the correct statistics', () => {
  const data = clubs([
    record({ seura: 'Äänekoski', jasenmaara: 25, aanimaara: 15 }),
    record({ seura: 'Muu seura', jasenmaara: 75, aanimaara: 15 }),
    record({ jasenmaara: null }),
  ]);
  assert.equal(searchClubs(data, 'aanekoski').length, 1);
  assert.equal(searchClubs(data, 'JYVASKYLA').length, 3);
  const filtered = filterClubs(data, { query: 'jyvaskyla', maxMembers: 25, votes: 15 });
  assert.equal(getTotals(filtered).members, 25);
  assert.equal(getTotals(filtered).clubs, 1);
  assert.equal(filterClubs(data, { query: '', maxMembers: null, votes: null }).length, 3);
  assert.equal(filterClubs(data, { query: 'no match', maxMembers: null, votes: null }).length, 0);
});

test('marker size is smooth and strictly increasing beyond 999 members', () => {
  const values = [0, 25, 75, 150, 300, 999, 1000, 10000, 1000000].map(markerRadius);
  for (let index = 1; index < values.length; index++) assert.ok(values[index] > values[index - 1]);
  assert.ok(values.at(-1) < 28);
  assert.ok(markerRadius(26) - markerRadius(25) < 1);
  assert.ok(Number.isFinite(markerRadius(null)));
});

test('voting colors match exact anchors and interpolate future values', () => {
  assert.equal(markerColor(10), '#2563eb');
  assert.equal(markerColor(15), '#f59e0b');
  assert.equal(markerColor(20), '#dc2626');
  assert.notEqual(markerColor(12), markerColor(10));
  assert.notEqual(markerColor(12), markerColor(15));
  assert.notEqual(markerColor(25), markerColor(30));
  assert.equal(markerColor(null), '#64748b');
  assert.ok(/^#[0-9a-f]{6}$/.test(markerColor(0)));
});

test('repository caches successful requests and retries failures', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (url) => {
    assert.equal(url, './jsondb/seurat.json');
    requests++;
    return requests === 1 ? new Response('', { status: 503 }) : Response.json(payload([record()]));
  };
  try {
    await assert.rejects(clubRepository.getDatabase(), /503/);
    const [first, second] = await Promise.all([clubRepository.getDatabase(), clubRepository.getDatabase()]);
    assert.equal(first, second);
    assert.equal(first.data.length, 1);
    assert.equal(requests, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
