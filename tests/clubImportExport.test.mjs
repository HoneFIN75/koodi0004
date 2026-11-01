import test from 'node:test';
import assert from 'node:assert/strict';
import { exportClubFile, parseClubFile, planClubImport } from '../src/services/clubImportExport.ts';

const club = (overrides = {}) => ({
  id: 'club_original',
  seura: 'Esimerkkiseura ry',
  paikkakunta: 'Helsinki',
  latitude: 60.17,
  longitude: 24.94,
  jasenmaara: 120,
  aanimaara: 15,
  contact: {
    name: 'Yhteyshenkilö',
    email: 'yhteys@example.fi',
    phone: '+358 40 123 4567',
    website: 'https://example.fi',
    instagram: '',
    tiktok: '',
    public: false,
  },
  details: { district: 'Etelä' },
  archived: false,
  ...overrides,
});
const file = (clubs) => ({
  format: 'seurakartta-clubs',
  version: 1,
  exportedAt: '2026-11-01T12:00:00.000Z',
  clubs,
});

test('JSON export round-trips IDs, private contacts, details, unknown counts, and archived state', () => {
  const source = [club({ jasenmaara: null, aanimaara: null, archived: true })];
  const exported = exportClubFile(source, true);
  const parsed = parseClubFile(JSON.parse(JSON.stringify(exported)));
  assert.equal(exported.format, 'seurakartta-clubs');
  assert.equal(exported.version, 1);
  assert.equal(parsed.clubs[0].id, source[0].id);
  assert.deepEqual(parsed.clubs[0].contact, source[0].contact);
  assert.deepEqual(parsed.clubs[0].details, source[0].details);
  assert.equal(parsed.clubs[0].jasenmaara, null);
  assert.equal(parsed.clubs[0].aanimaara, null);
  assert.equal(parsed.clubs[0].archived, true);
  assert.equal(exportClubFile(source, false).clubs.length, 0);
});

test('parser derives voting power and reports mismatches without discarding valid club records', () => {
  const parsed = parseClubFile(file([club({ aanimaara: 999 })]));
  assert.equal(parsed.clubs[0].aanimaara, 15);
  assert.match(parsed.warnings[0], /lasketaan tuonnissa/);
});

test('parser rejects unsupported versions, duplicate IDs, unsafe URLs, and malformed records', () => {
  assert.throws(() => parseClubFile({ ...file([]), version: 2 }), /ei tueta/);
  assert.throws(() => parseClubFile(file([club(), club()])), /toistuva seura-ID/);
  assert.throws(() => parseClubFile(file([club({ contact: { ...club().contact, website: 'javascript:alert(1)' } })])), /HTTP\(S\)-osoitteen/);
  assert.throws(() => parseClubFile(file([club({ contact: { ...club().contact, email: 'bad..address@example.fi' } })])), /sähköpostiosoite/);
  assert.throws(() => parseClubFile(file([club({ jasenmaara: 1.5 })])), /kokonaisluku/);
  assert.throws(() => parseClubFile(file([club({ surprise: 'unknown' })])), /tuntemattomat kentät/);
});

test('merge updates and adds by ID, preserves missing current clubs, and reports state transitions', () => {
  const current = [
    club(),
    club({ id: 'club_archive', seura: 'Arkistoitu', archived: true }),
    club({ id: 'club_unchanged', seura: 'Sama' }),
  ];
  const incoming = [
    club({ seura: 'Päivitetty seura', archived: true }),
    club({ id: 'club_archive', seura: 'Arkistoitu', archived: false }),
    club({ id: 'club_unchanged', seura: 'Sama' }),
    club({ id: 'club_new', seura: 'Uusi', paikkakunta: 'Turku' }),
  ];
  const result = planClubImport(current, incoming, 'merge');
  assert.equal(result.summary.added, 1);
  assert.equal(result.summary.updated, 2);
  assert.equal(result.summary.unchanged, 1);
  assert.equal(result.summary.archived, 1);
  assert.equal(result.summary.restored, 1);
  assert.equal(result.data.length, 4);
  assert.equal(result.data.find((item) => item.id === 'club_archive').archived, false);
});

test('add-only skips existing IDs and uniquely matching name-town pairs', () => {
  const current = [club(), club({ id: 'club_other', seura: 'Toinen', paikkakunta: 'Oulu' })];
  const incoming = [
    club({ seura: 'Changed name ignored' }),
    club({ id: 'another-id', seura: ' Esimerkkiseura ry ', paikkakunta: ' Helsinki ' }),
    club({ id: 'club_new', seura: 'Uusi seura', paikkakunta: 'Turku' }),
  ];
  const result = planClubImport(current, incoming, 'new');
  assert.equal(result.summary.skipped, 2);
  assert.equal(result.summary.added, 1);
  assert.equal(result.data.length, 3);
  assert.equal(result.data[0].seura, 'Esimerkkiseura ry');
});

test('merge and add-only reject ambiguous name-town matches rather than guessing', () => {
  const duplicateClubs = [
    club({ id: 'club_duplicate_1' }),
    club({ id: 'club_duplicate_2' }),
  ];
  const newClub = club({ id: 'club_unknown' });
  assert.throws(() => planClubImport(duplicateClubs, [newClub], 'merge'), /ID ei täsmää/);
  assert.throws(() => planClubImport(duplicateClubs, [newClub], 'new'), /vastaa useaa nykyistä seuraa/);
});

test('replace reports removals and produces exactly the reviewed incoming records', () => {
  const current = [club(), club({ id: 'club_removed', seura: 'Poistuu' })];
  const incoming = [club({ seura: 'Päivitetty' }), club({ id: 'club_new', seura: 'Uusi', paikkakunta: 'Turku' })];
  const result = planClubImport(current, incoming, 'replace');
  assert.equal(result.summary.added, 1);
  assert.equal(result.summary.updated, 1);
  assert.equal(result.summary.removed, 1);
  assert.deepEqual(result.data, incoming);
});

test('replace rejects a new ID colliding with an existing normalized name-town identity', () => {
  assert.throws(() => planClubImport([club()], [club({ id: 'club_other' })], 'replace'), /eri ID:llä/);
});

test('replace preserves known duplicate name-town groups but rejects newly introduced duplicate identities', () => {
  const first = club({ id: 'club_duplicate_1' });
  const second = club({ id: 'club_duplicate_2' });
  assert.equal(planClubImport([first, second], [first, second], 'replace').data.length, 2);
  assert.throws(() => planClubImport([], [first, second], 'replace'), /useita seuroja samalla nimellä/);
});
