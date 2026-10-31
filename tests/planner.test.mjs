import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { unzipSync, strFromU8 } from 'fflate';
import { parseDatabase } from '../src/data/clubRepository.ts';
import { parseMunicipalities } from '../src/data/municipalityRepository.ts';
import { assignClubs, analyzeScenario, computeRegionStats, aggregateByMunicipality, filterPlacements, emptyFilters, explainCoverage } from '../src/services/regionAnalytics.ts';
import { validateScenario, VALIDATION_THRESHOLDS } from '../src/services/validationService.ts';
import { createDocument, createRegion, activeScenario, documentOps, normalizeDocument, parseImport } from '../src/services/plannerDocument.ts';
import { createHistory, pushHistory, undoHistory, redoHistory, replacePresent } from '../src/services/historyService.ts';
import { createStorage, createRemoteStorage, createMemoryAdapter, RemoteStorageError, STORAGE_KEYS } from '../src/services/persistenceService.ts';
import { addSnapshot, compareDocuments, BACKUP_LIMIT, shouldAutoBackup } from '../src/services/backupService.ts';
import { exportJson, exportCsv, exportXlsx } from '../src/services/exportService.ts';
import { REGION_COLORS, normalizeHex, nextColor, readableTextColor } from '../src/services/regionColors.ts';
import { createPlannerStore } from '../src/state/plannerStore.ts';

const dataset = parseMunicipalities(JSON.parse(await readFile(new URL('../public/geo/kunnat.geojson', import.meta.url), 'utf8')));
const database = parseDatabase(JSON.parse(await readFile(new URL('../jsondb/seurat.json', import.meta.url), 'utf8')));
const placements = assignClubs(database.data, dataset);
const codeOf = (name) => dataset.municipalities.find((item) => item.name === name).code;
const regionWith = (names, draft = {}) => ({ ...createRegion([], draft), municipalityCodes: names.map(codeOf) });

test('municipality dataset covers mainland Finland and all of Åland', () => {
  assert.equal(dataset.municipalities.length, 308);
  const aland = dataset.municipalities.filter((item) => item.province === 'Ahvenanmaa');
  assert.equal(aland.length, 16);
  assert.ok(aland.some((item) => item.name === 'Maarianhamina'));
  assert.ok(Math.abs(dataset.totalAreaKm2 - 336_700) < 2_000, `total area ${dataset.totalAreaKm2}`);
  const inari = dataset.municipalities.find((item) => item.name === 'Inari');
  assert.ok(inari.areaKm2 > 16_000 && inari.areaKm2 < 18_500);
});

test('municipality parser rejects unusable input and skips broken features', () => {
  assert.throws(() => parseMunicipalities(null));
  assert.throws(() => parseMunicipalities({ type: 'FeatureCollection', features: [{ properties: {}, geometry: null }] }));
  const square = [[[25, 60], [25.1, 60], [25.1, 60.1], [25, 60.1], [25, 60]]];
  const parsed = parseMunicipalities({ type: 'FeatureCollection', features: [
    { properties: { code: '001', name: 'Testi' }, geometry: { type: 'Polygon', coordinates: square } },
    { properties: { name: 'Ei koodia' }, geometry: { type: 'Polygon', coordinates: square } },
    { properties: { code: '002' }, geometry: { type: 'Polygon', coordinates: square } },
    { properties: { code: '003', name: 'Rikki' }, geometry: { type: 'Polygon', coordinates: 'x' } },
    { properties: { code: '001', name: 'Kaksoiskappale' }, geometry: { type: 'Polygon', coordinates: square } },
  ] });
  assert.deepEqual(parsed.municipalities.map((item) => item.code).sort(), ['001', 'Ei koodia'], 'name is the fallback code');
  assert.ok(parsed.municipalities[0].areaKm2 > 50 && parsed.municipalities[0].areaKm2 < 70);
});

test('every club in the database is placed into a municipality', () => {
  assert.equal(placements.length, database.data.length);
  assert.deepEqual(placements.filter((item) => !item.municipalityCode).map((item) => item.club.seura), []);
  assert.ok(placements.some((item) => item.method === 'location'), 'former municipalities resolved by coordinates');
});

test('region statistics aggregate clubs, members, votes and area', () => {
  const index = aggregateByMunicipality(placements, dataset);
  const region = regionWith(['Helsinki', 'Espoo']);
  const stats = computeRegionStats(region, dataset, index);
  const expected = placements.filter((item) => region.municipalityCodes.includes(item.municipalityCode));
  assert.equal(stats.municipalityCount, 2);
  assert.equal(stats.clubCount, expected.length);
  assert.equal(stats.members, expected.reduce((sum, item) => sum + (item.club.jasenmaara ?? 0), 0));
  assert.equal(stats.votes, expected.reduce((sum, item) => sum + (item.club.aanimaara ?? 0), 0));
  assert.ok(stats.largestClub.jasenmaara >= stats.smallestClub.jasenmaara);
  assert.ok(stats.areaShare > 0 && stats.areaShare < 0.01);
  assert.equal(stats.population, null);

  const unknown = computeRegionStats({ ...region, municipalityCodes: ['999999'] }, dataset, index);
  assert.deepEqual(unknown.missingCodes, ['999999']);
  assert.equal(unknown.clubCount, 0);
  assert.equal(unknown.averageMembers, null);
});

test('scenario analysis counts only enabled regions as assignments and allows overlap', () => {
  const a = regionWith(['Helsinki', 'Vantaa']);
  const b = regionWith(['Helsinki', 'Espoo']);
  const disabled = { ...regionWith(['Inari']), enabled: false };
  const analysis = analyzeScenario([a, b, disabled], dataset, placements);
  assert.equal(analysis.assignedCodes.size, 3);
  assert.ok(analysis.unassigned.some((row) => row.municipality.name === 'Inari'));
  assert.equal(analysis.unassigned.length, 308 - 3);
  assert.equal(analysis.totals.clubs, placements.length);
  assert.equal(analysis.stats.get(a.id).clubCount + analysis.stats.get(b.id).clubCount > analysis.stats.get(a.id).clubCount, true);
});

test('coverage explanation is human readable', () => {
  const north = regionWith(['Inari', 'Utsjoki', 'Enontekiö'], { name: 'Lappi' });
  const south = regionWith(['Helsinki'], { name: 'Pääkaupunki' });
  const analysis = analyzeScenario([north, south], dataset, placements);
  const text = explainCoverage(north, analysis.stats.get(north.id), analysis);
  assert.match(text, /Lappi kattaa noin \d+,\d % Suomen pinta-alasta/);
  assert.match(text, /harvaan|ei ole lainkaan seuroja/);
  const empty = createRegion([], { name: 'Tyhjä' });
  assert.match(explainCoverage(empty, computeRegionStats(empty, dataset, new Map()), analysis), /ei vielä sisällä/);
});

test('filters narrow placements by club, municipality, members, votes and region', () => {
  const region = regionWith(['Helsinki']);
  const byRegion = filterPlacements(placements, { ...emptyFilters, regionIds: [region.id] }, dataset, [region]);
  assert.ok(byRegion.length > 0 && byRegion.every((item) => item.municipalityCode === codeOf('Helsinki')));
  const byVotes = filterPlacements(placements, { ...emptyFilters, votes: 20 }, dataset, []);
  assert.ok(byVotes.every((item) => item.club.aanimaara === 20));
  const byMembers = filterPlacements(placements, { ...emptyFilters, minMembers: 100, maxMembers: 200 }, dataset, []);
  assert.ok(byMembers.every((item) => item.club.jasenmaara >= 100 && item.club.jasenmaara <= 200));
  const byText = filterPlacements(placements, { ...emptyFilters, municipalityQuery: 'kouvola' }, dataset, []);
  assert.ok(byText.length > 0 && byText.every((item) => /kouvola/i.test(item.club.paikkakunta) || item.municipalityCode === codeOf('Kouvola')));
});

test('validation engine reports planning issues', () => {
  const huge = regionWith(dataset.municipalities.filter((item) => item.province === 'Lappi').map((item) => item.name), { name: 'Iso' });
  const single = regionWith(['Helsinki'], { name: 'Yksi' });
  const empty = createRegion([huge, single], { name: 'Tyhjä' });
  const regions = [huge, single, empty];
  const ids = validateScenario(regions, dataset, analyzeScenario(regions, dataset, placements)).map((item) => item.id);
  assert.ok(ids.includes('unassigned'));
  assert.ok(ids.some((id) => id.startsWith('single-') || id.includes('single')), ids.join());
  assert.ok(ids.some((id) => id.includes('empty')), ids.join());
  assert.equal(VALIDATION_THRESHOLDS.maxAreaShare, 0.4);
  const allArea = regionWith(dataset.municipalities.map((item) => item.name), { name: 'Kaikki' });
  const fullIds = validateScenario([allArea], dataset, analyzeScenario([allArea], dataset, placements)).map((item) => item.id);
  assert.ok(fullIds.some((id) => id.includes('area')), fullIds.join());
  assert.ok(!fullIds.includes('unassigned'));
  const noClubs = regionWith(['Utsjoki']);
  const noClubIds = validateScenario([noClubs], dataset, analyzeScenario([noClubs], dataset, placements)).map((item) => item.id);
  assert.ok(noClubIds.some((id) => id.includes('no-clubs') || id.includes('clubs')), noClubIds.join());
});

test('validation compares member and vote counts against the average', () => {
  const big = regionWith(['Helsinki', 'Espoo', 'Vantaa', 'Tampere', 'Turku']);
  const small = [['Kouvola'], ['Kotka'], ['Lahti']].map((names) => regionWith(names));
  const regions = [big, ...small];
  const warnings = validateScenario(regions, dataset, analyzeScenario(regions, dataset, placements));
  assert.ok(warnings.some((item) => item.regionId === big.id && /keskiarvo/i.test(item.message)), JSON.stringify(warnings));
});

test('document operations support full region and scenario CRUD', () => {
  let document = createDocument();
  const added = documentOps.addRegion(document, { name: 'Etelä', shortName: 'E' });
  document = added.document;
  assert.equal(added.region.number, 1);
  assert.equal(added.region.opacity, 0.4);
  document = documentOps.updateRegion(document, added.region.id, { color: 'not-a-colour', opacity: 4 });
  assert.equal(activeScenario(document).regions[0].color, added.region.color);
  assert.equal(activeScenario(document).regions[0].opacity, 1);
  document = documentOps.setMunicipalities(document, added.region.id, ['091', '049', '091'], 'add');
  document = documentOps.setMunicipalities(document, added.region.id, ['049'], 'toggle');
  assert.deepEqual(activeScenario(document).regions[0].municipalityCodes, ['091']);
  const copy = documentOps.duplicateRegion(document, added.region.id);
  document = copy.document;
  assert.equal(copy.region.number, 2);
  assert.notEqual(copy.region.color, added.region.color);
  document = documentOps.deleteRegion(document, added.region.id);
  assert.equal(activeScenario(document).regions.length, 1);

  const firstId = document.activeScenarioId;
  document = documentOps.duplicateScenario(document, firstId);
  assert.equal(document.scenarios.length, 2);
  assert.notEqual(document.scenarios[1].regions[0].id, document.scenarios[0].regions[0].id);
  document = documentOps.renameScenario(document, document.activeScenarioId, ' Ehdotus A ');
  assert.equal(activeScenario(document).name, 'Ehdotus A');
  document = documentOps.deleteScenario(document, document.activeScenarioId);
  assert.equal(document.activeScenarioId, firstId);
  assert.equal(documentOps.deleteScenario(document, firstId), document, 'last scenario is kept');
});

test('history keeps at least 50 steps, coalesces rapid edits and supports redo', () => {
  let history = createHistory(0);
  for (let index = 1; index <= 60; index += 1) history = pushHistory(history, index, `step ${index}`, null, index * 1000);
  assert.ok(history.past.length >= 50);
  history = pushHistory(history, 61, 'slider', 'opacity', 100_000);
  history = pushHistory(history, 62, 'slider', 'opacity', 100_300);
  history = pushHistory(history, 63, 'slider', 'opacity', 100_600);
  assert.equal(history.present, 63);
  history = undoHistory(history);
  assert.equal(history.present, 60);
  history = redoHistory(history);
  assert.equal(history.present, 63);
  history = undoHistory(undoHistory(history));
  history = pushHistory(history, 99, 'branch', null, 200_000);
  assert.deepEqual(history.future, []);
  const navigated = replacePresent(history, 100);
  assert.equal(navigated.past.length, history.past.length);
  let capped = createHistory(0);
  for (let index = 1; index <= 150; index += 1) capped = pushHistory(capped, index, 'x', null, index * 1000);
  assert.equal(capped.past.length, 100);
});

test('document normalization and import are defensive', () => {
  assert.equal(normalizeDocument(null), null);
  assert.equal(normalizeDocument({ scenarios: 'nope' }), null);
  const document = documentOps.addRegion(createDocument(), { name: 'X' }).document;
  const restored = normalizeDocument(JSON.parse(JSON.stringify({ document })));
  assert.deepEqual(restored, document);
  const broken = normalizeDocument({ ...document, activeScenarioId: 'missing', scenarios: [{ ...document.scenarios[0], regions: [{ name: 'Y', color: 'zzz', opacity: 'x', municipalityCodes: [1, '091', null] }] }] });
  assert.equal(broken.activeScenarioId, broken.scenarios[0].id);
  assert.match(broken.scenarios[0].regions[0].color, /^#[0-9A-F]{6}$/);
  assert.equal(broken.scenarios[0].regions[0].opacity, 0.4);
  assert.throws(() => parseImport({ foo: 1 }), /alue- tai skenaariomäärityksiä/);
  const imported = parseImport({ document });
  assert.equal(imported.kind, 'document');
  assert.notEqual(imported.scenarios[0].id, document.scenarios[0].id);
  const regions = parseImport([{ name: 'Alue', municipalityCodes: ['091'] }]);
  assert.equal(regions.kind, 'regions');
  assert.deepEqual(regions.regions[0].municipalityCodes, ['091']);
});

test('exports round-trip JSON and produce safe CSV and valid XLSX', () => {
  let document = documentOps.addRegion(createDocument(), { name: '=HYPERLINK("x")', shortName: 'H' }).document;
  const region = activeScenario(document).regions[0];
  document = documentOps.setMunicipalities(document, region.id, [codeOf('Helsinki'), codeOf('Maarianhamina')], 'add');
  const context = { document, dataset, placements, clubMetadata: database.metadata, scope: 'all', exportedAt: new Date('2026-01-01T00:00:00Z') };
  const json = JSON.parse(exportJson(context));
  assert.equal(json.format, 'koodi0004-region-planner');
  assert.deepEqual(parseImport(json).scenarios[0].regions[0].municipalityCodes, activeScenario(document).regions[0].municipalityCodes);
  const exportedRegion = JSON.stringify(json);
  for (const field of ['color', 'opacity', 'visible', 'enabled']) assert.ok(exportedRegion.includes(`"${field}"`), field);
  const csv = exportCsv(context);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes(';'));
  assert.ok(!/;=HYPERLINK/.test(csv) && !/;"=HYPERLINK/.test(csv), 'formula injection neutralized');
  const files = unzipSync(exportXlsx(context));
  for (const name of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']) assert.ok(files[name], name);
  assert.match(strFromU8(files['xl/workbook.xml']), /Alueet/);
  assert.match(strFromU8(files['xl/worksheets/sheet2.xml']), /Maarianhamina/);
});

test('storage falls back from IndexedDB to localStorage to memory', async () => {
  const values = new Map();
  const localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
  const local = await createStorage({ localStorage });
  assert.equal(local.kind, 'LocalStorage');
  await local.set('k', { a: 1 });
  assert.deepEqual(await local.get('k'), { a: 1 });
  const memory = await createStorage({});
  assert.equal(memory.kind, 'Muisti');
  const failingIdb = { open: () => { throw new Error('blocked'); } };
  assert.equal((await createStorage({ indexedDB: failingIdb, localStorage })).kind, 'LocalStorage');
});

test('remote storage uses conditional shared writes and reports conflicts', async () => {
  const originalFetch = globalThis.fetch;
  const document = createDocument();
  let state = { document: null, backups: [], revision: null };
  let rejectWrites = false;
  const requests = [];
  globalThis.fetch = async (_url, init) => {
    requests.push(init);
    if (init.method === 'GET') return Response.json(state);
    assert.equal(init.headers['X-Planner-Write-Key'], 'temporary-write-key');
    if (state.revision === null) assert.equal(init.headers['If-None-Match'], '*');
    else assert.equal(init.headers['X-Expected-Revision'], state.revision);
    if (rejectWrites) return Response.json({ error: 'conflict' }, { status: 409 });
    const body = JSON.parse(init.body);
    state = { ...body, revision: 'revision-1' };
    return Response.json({ revision: state.revision });
  };
  try {
    const adapter = createRemoteStorage('/api/planner.php');
    assert.equal(await adapter.get(STORAGE_KEYS.document), null);
    adapter.setWriteKey('temporary-write-key');
    await adapter.set(STORAGE_KEYS.document, document);
    assert.deepEqual(state.document, document);
    rejectWrites = true;
    await assert.rejects(() => adapter.set(STORAGE_KEYS.backups, []), (error) => error instanceof RemoteStorageError && error.status === 409);
    assert.equal(requests.filter((request) => request.method === 'PUT').length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('remote storage refuses migration when the server already has a plan', async () => {
  const originalFetch = globalThis.fetch;
  const document = createDocument();
  globalThis.fetch = async (_url, init) => {
    if (init.method === 'GET') return Response.json({ document, backups: [], revision: 'existing' });
    throw new Error('an existing server plan must never be overwritten');
  };
  try {
    const adapter = createRemoteStorage('/api/planner.php');
    await assert.rejects(() => adapter.migrate(createDocument(), []), (error) => error instanceof RemoteStorageError && error.status === 409);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('backups keep the latest 10 snapshots and can be compared', () => {
  let backups = [];
  let document = createDocument();
  for (let index = 0; index < 15; index += 1) {
    document = documentOps.addRegion(document, { name: `R${index}` }).document;
    backups = addSnapshot(backups, document, `b${index}`, new Date(2026, 0, 1, 0, index));
  }
  assert.equal(backups.length, BACKUP_LIMIT);
  assert.equal(addSnapshot(backups, document, 'same').length, BACKUP_LIMIT);
  assert.ok(backups.every((backup) => typeof backup.createdAt === 'string'));
  assert.equal(shouldAutoBackup([], Date.now()), true);
  const before = document;
  const target = activeScenario(document).regions[0];
  let after = documentOps.updateRegion(document, target.id, { name: 'Uusi nimi', color: '#000000' });
  after = documentOps.setMunicipalities(after, target.id, ['091'], 'add');
  after = documentOps.deleteRegion(after, activeScenario(after).regions[1].id);
  after = documentOps.addScenario(after, 'Ehdotus B');
  const diff = compareDocuments(before, after);
  assert.deepEqual(diff.addedScenarios, ['Ehdotus B']);
  assert.equal(diff.removedRegions.length, 1);
  assert.deepEqual(diff.changedRegions[0].changes, ['nimi', 'väri', '+1 kuntaa']);
});

test('colour palette and helpers', () => {
  assert.ok(REGION_COLORS.length >= 30);
  assert.equal(new Set(REGION_COLORS).size, REGION_COLORS.length);
  assert.equal(normalizeHex('dc2626'), '#DC2626');
  assert.equal(normalizeHex('#abc'), '#AABBCC');
  assert.equal(normalizeHex('red'), null);
  assert.ok(!['#DC2626'].includes(nextColor(['#DC2626'])));
  assert.equal(readableTextColor('#FFFFFF'), '#000000');
  assert.equal(readableTextColor('#111827'), '#FFFFFF');
});

test('store persists automatically, restores state and supports undo/redo', async () => {
  const adapter = createMemoryAdapter();
  const store = createPlannerStore({ storage: async () => adapter, debounceMs: 0 });
  await store.getState().init();
  assert.equal(store.getState().storageKind, 'Muisti');
  store.getState().commit('Luo alue', (document) => documentOps.addRegion(document, { name: 'Pysyvä' }).document);
  assert.equal(store.getState().saveStatus, 'unsaved');
  await store.getState().flush();
  assert.equal(store.getState().saveStatus, 'saved');

  const reopened = createPlannerStore({ storage: async () => adapter, debounceMs: 0 });
  await reopened.getState().init();
  assert.equal(activeScenario(reopened.getState().history.present).regions[0].name, 'Pysyvä');

  reopened.getState().undo();
  assert.equal(activeScenario(reopened.getState().history.present).regions.length, 1, 'history does not survive reload');
  store.getState().undo();
  assert.equal(activeScenario(store.getState().history.present).regions.length, 0);
  store.getState().redo();
  assert.equal(activeScenario(store.getState().history.present).regions.length, 1);

  await store.getState().createBackup('Käsin');
  store.getState().commit('Poista', (document) => documentOps.deleteRegion(document, activeScenario(document).regions[0].id));
  const backupId = store.getState().backups.find((backup) => backup.reason === 'Käsin').id;
  await store.getState().restoreBackup(backupId);
  assert.equal(activeScenario(store.getState().history.present).regions.length, 1);
  store.getState().undo();
  assert.equal(activeScenario(store.getState().history.present).regions.length, 0, 'restore is undoable');
  await store.getState().flush();
});
