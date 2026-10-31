import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  createCompetitionDataset, competitionRepository, COMPETITION_URL, COMPETITION_MUNICIPALITY_ALIASES,
  buildCompetitionMunicipalityAliases, normalizeCompetitionMunicipalityAlias,
  normalizeCompetition, getCompetitionIdentifierBase,
} from '../src/data/competitionRepository.ts';
import { parseMunicipalities } from '../src/data/municipalityRepository.ts';
import {
  analyzeCompetitions, filterCompetitions, formatCompetitionDate, getAllCompetitions, getCompetitionById,
  getCompetitionCount, getCompetitionCourses, getCompetitionYearColor, getCompetitionsByMunicipality,
  getCompetitionsByRegion, getPrimaryMunicipality, getSecondaryMunicipalities,
} from '../src/services/competitionService.ts';

const municipalities = parseMunicipalities(JSON.parse(await readFile(new URL('../public/geo/kunnat.geojson', import.meta.url), 'utf8')));
const source = JSON.parse(await readFile(new URL('../public/data/SFL-Kilpailut_lopullinen.json', import.meta.url), 'utf8'));
const dataset = createCompetitionDataset(source, municipalities);
const municipality = (name) => municipalities.municipalities.find((item) => item.name === name);
const event = (overrides = {}) => ({
  name: 'Testikilpailu', year: 2025, startDate: '2025-06-01', endDate: '2025-06-01',
  competitionModel: 'Erilliskilpailu', divisionType: 'mixed', pdgaTier: 'C-tier',
  organizer: 'Testijärjestäjä', municipalities: [{ name: 'Helsinki', primary: true, courses: ['Testirata'] }],
  ...overrides,
});
const filters = (overrides = {}) => ({
  visibility: 'all', years: [], query: '', model: '', tier: '', organizer: '', municipality: '', regionId: '', ...overrides,
});

test('real competition source retains every event and reports its known data quality', () => {
  const before = JSON.stringify(source);
  assert.equal(getCompetitionCount(dataset), 2304);
  assert.equal(getAllCompetitions(dataset).length, source.competitions.length);
  assert.deepEqual(dataset.years, [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
  assert.deepEqual(dataset.years.map((year) => dataset.byYear.get(year).length), [1, 235, 262, 303, 369, 399, 413, 322]);
  assert.equal(dataset.competitions.filter((competition) => competition.municipalities.length > 1).length, 64);
  assert.equal(dataset.competitions.filter((competition) => competition.durationDays === null
    && competition.issues.some((issue) => issue.includes('käänteinen'))).length, 68);
  assert.equal(dataset.issues.filter((issue) => issue.message.includes('ei vastaa')).length, 0);
  assert.equal(dataset.issues.filter((issue) => issue.message.includes('Alkamispäivä') || issue.message.includes('Päättymispäivä')).length, 0);
  assert.equal(dataset.issues.filter((issue) => issue.message.includes('rata puuttuu')).length, 38);
  assert.equal(dataset.issues.filter((issue) => issue.message.includes('ei voitu yhdistää kuntatietoihin')).length, 162);
  assert.equal(new Set(dataset.issues.filter((issue) => issue.message.includes('ei voitu yhdistää kuntatietoihin'))
    .map((issue) => issue.message.match(/”(.+)”/)[1])).size, 110);
  assert.equal(dataset.aliasResolutions.length, 27);
  assert.equal(analyzeCompetitions(dataset.competitions, municipalities).unmappedCount, 153);
  assert.equal(dataset.issues.length, 281);
  assert.equal(dataset.issues.filter((issue) => issue.message.includes('epäselvä')).length, 0);
  assert.equal(dataset.issues.filter((issue) => issue.message.includes('poikkeaa tavallisista tasomerkinnöistä')).length, 13);
  assert.equal(dataset.competitions.filter((competition) => competition.municipalities.filter((item) => item.primary).length !== 1).length, 0);
  assert.equal(JSON.stringify(source), before);
  assert.ok(dataset.issues.some((issue) => issue.message.includes('ei voitu yhdistää kuntatietoihin')));
  assert.ok(dataset.issues.some((issue) => issue.message.includes('rata puuttuu')));
  assert.ok(dataset.issues.some((issue) => issue.message.includes('poikkeaa tavallisista tasomerkinnöistä')));
  assert.ok(dataset.competitions.some((competition) => competition.name === 'NBDG Special Raasepori'
    && competition.startDate === '2020-12-09' && competition.endDate === '2020-09-13'));
});

test('explicit annotated aliases resolve conservatively, preserving source names and diacritics', () => {
  const rows = COMPETITION_MUNICIPALITY_ALIASES.map(([name]) => event({
    municipalities: [{ name, primary: true, courses: ['Ääkkösten Åland-rata'] }],
  }));
  const input = { competitions: rows };
  const before = JSON.stringify(input);
  const parsed = createCompetitionDataset(input, municipalities);
  for (const [index, [name, target]] of COMPETITION_MUNICIPALITY_ALIASES.entries()) {
    const location = getPrimaryMunicipality(parsed.competitions[index]);
    assert.equal(location.name, name);
    assert.equal(location.municipalityCode, municipality(target).code);
    assert.deepEqual(location.courses, ['Ääkkösten Åland-rata']);
    assert.equal(parsed.aliasResolutions[index].sourceName, name);
    assert.equal(parsed.aliasResolutions[index].municipalityName, target);
  }
  assert.equal(JSON.stringify(input), before);
  assert.equal(normalizeCompetitionMunicipalityAlias(' JÄMSÄ ( JÄMSÄNKOSKI ) '), 'jämsä(jämsänkoski)');
  assert.equal(normalizeCompetitionMunicipalityAlias('Geta , A\u030aland'), 'geta,åland');
  assert.notEqual(normalizeCompetitionMunicipalityAlias('Geta, Aland'), normalizeCompetitionMunicipalityAlias('Geta, Åland'));
});

test('aliases match primary and secondary lookups across punctuation, casing and bilingual names', () => {
  const parsed = createCompetitionDataset({ competitions: [
    event({ municipalities: [
      { name: ' RAASEPORI ,  KARJAA ', primary: true, courses: ['A'] },
      { name: 'Geta, A\u030aland', primary: false, courses: ['B'] },
    ] }),
    event({ municipalities: [{ name: 'Raasepori', primary: true, courses: ['C'] }] }),
  ] }, municipalities);
  assert.equal(getPrimaryMunicipality(parsed.competitions[0]).municipalityCode, municipality('Raasepori').code);
  for (const query of ['Raasepori', 'Raseborg', 'raasepori,karjaa', 'Raasepori , Karjaa']) {
    assert.equal(getCompetitionsByMunicipality(parsed, query).length, 2, query);
    assert.equal(filterCompetitions(parsed, filters({ municipality: query })).length, 2, query);
  }
  assert.equal(getCompetitionsByMunicipality(parsed, 'Geta, Åland').length, 0);
  assert.equal(getCompetitionsByMunicipality(parsed, 'Geta , Åland', { includeSecondary: true }).length, 1);
  assert.equal(filterCompetitions(parsed, filters({ municipality: 'Geta, Åland' })).length, 1);
  assert.equal(filterCompetitions(parsed, filters({ query: 'KARJAA' })).length, 1);
});

test('bare historical and mixed-city strings remain unresolved; missing or ambiguous targets block aliases', () => {
  const names = ['Nilsiä', 'Karjaa', 'Tammisaari', 'Sammatti', 'Nastola', 'Espoo, Helsinki', 'Geta, Eckerö', 'Geta, Aland'];
  const parsed = createCompetitionDataset({ competitions: names.map((name) => event({
    municipalities: [{ name, primary: true, courses: ['A'] }],
  })) }, municipalities);
  assert.equal(parsed.aliasResolutions.length, 0);
  for (const competition of parsed.competitions) assert.equal(getPrimaryMunicipality(competition).municipalityCode, null);
  assert.equal(filterCompetitions(parsed, filters({ query: 'Espoo, Helsinki' })).length, 1);
  const withoutKuopio = { ...municipalities, municipalities: municipalities.municipalities.filter((item) => item.name !== 'Kuopio') };
  assert.equal(buildCompetitionMunicipalityAliases(withoutKuopio).has(normalizeCompetitionMunicipalityAlias('Nilsiä (Kuopio)')), false);
  const ambiguousKuopio = {
    ...municipalities,
    municipalities: [...municipalities.municipalities, { ...municipality('Kuopio'), code: 'ambiguous-kuopio' }],
  };
  assert.equal(buildCompetitionMunicipalityAliases(ambiguousKuopio).has(normalizeCompetitionMunicipalityAlias('Nilsiä (Kuopio)')), false);
});

test('source dates are valid ISO dates; formatting and durations do not repair reversed ranges', () => {
  for (const row of source.competitions) {
    assert.match(row.startDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(row.endDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.notEqual(formatCompetitionDate(row.startDate), 'Tuntematon päivämäärä');
    assert.notEqual(formatCompetitionDate(row.endDate), 'Tuntematon päivämäärä');
  }
  assert.equal(formatCompetitionDate('2025-02-03'), '3.2.2025');
  assert.equal(formatCompetitionDate('2025-02-30'), 'Tuntematon päivämäärä');
  assert.equal(formatCompetitionDate(''), 'Tuntematon päivämäärä');
  const reversed = createCompetitionDataset({ competitions: [event({ startDate: '2025-06-02', endDate: '2025-06-01' })] }, municipalities).competitions[0];
  assert.equal(reversed.startDate, '2025-06-02');
  assert.equal(reversed.endDate, '2025-06-01');
  assert.equal(reversed.year, 2025);
  assert.equal(reversed.durationDays, null);
});

test('IDs are stable and duplicate source records get deterministic source-index suffixes', () => {
  const input = { competitions: [event(), event()] };
  const before = JSON.stringify(input);
  const first = createCompetitionDataset(input, municipalities);
  const second = createCompetitionDataset(input, municipalities);
  assert.deepEqual(first.competitions.map((item) => item.id), second.competitions.map((item) => item.id));
  assert.notEqual(first.competitions[0].id, first.competitions[1].id);
  assert.ok(first.competitions[0].id.endsWith('-0'));
  assert.ok(first.competitions[1].id.endsWith('-1'));
  assert.equal(JSON.stringify(input), before);
});

test('public row normalization honors sourceIndex and exposes the exact unsuffixed identifier base', async () => {
  const input = event({ municipalities: [{ name: 'Nilsiä (Kuopio)', primary: true, courses: ['A'] }] });
  const before = JSON.stringify(input);
  const normalized = normalizeCompetition(input, 42, municipalities);
  assert.equal(normalized.sourceIndex, 42);
  assert.equal(normalized.id, getCompetitionIdentifierBase(normalized));
  assert.equal(getPrimaryMunicipality(normalized).municipalityCode, municipality('Kuopio').code);
  assert.equal(JSON.stringify(input), before);
  assert.equal(normalizeCompetition({}, 42, municipalities).name, 'Nimetön kilpailu (tietue 43)');
  const duplicateDataset = createCompetitionDataset({ competitions: [input, input] }, municipalities);
  for (const competition of duplicateDataset.competitions) {
    assert.equal(getCompetitionIdentifierBase(competition), normalized.id);
    assert.equal(competition.id, `${normalized.id}-${competition.sourceIndex}`);
  }
  const baseCounts = new Map();
  for (const competition of dataset.competitions) {
    const base = getCompetitionIdentifierBase(competition);
    baseCounts.set(base, (baseCounts.get(base) ?? 0) + 1);
    assert.deepEqual(normalizeCompetition(source.competitions[competition.sourceIndex], competition.sourceIndex, municipalities), {
      ...competition, id: base,
    });
  }
  assert.equal(baseCounts.size, 2296);
  assert.equal([...baseCounts.values()].filter((count) => count > 1).length, 8);
  const service = await import('../src/services/competitionService.ts');
  assert.equal(service.normalizeCompetition, normalizeCompetition);
  assert.equal(service.getCompetitionIdentifierBase, getCompetitionIdentifierBase);
});

test('malformed or unmapped rows remain searchable and do not acquire a geographic primary', () => {
  const parsed = createCompetitionDataset({ competitions: [
    event({ name: 'Historiallinen Karjaa', year: '2020', startDate: 'bad', endDate: '2025-03-01',
      municipalities: [{ name: 'Karjaa', primary: true, courses: [] }] }),
    event({ name: 'Useita ensisijaisia', municipalities: [
      { name: 'Helsinki', primary: true, courses: ['A'] }, { name: 'Espoo', primary: true, courses: ['B'] },
    ] }),
    event({ name: 'Ei ensisijaista', municipalities: [{ name: 'Helsinki', primary: false, courses: ['A'] }] }),
  ] }, municipalities);
  assert.equal(parsed.competitions.length, 3);
  assert.equal(parsed.competitions[0].year, null);
  assert.equal(parsed.competitions[0].municipalities[0].municipalityCode, null);
  assert.equal(getPrimaryMunicipality(parsed.competitions[0]).municipalityCode, null);
  assert.equal(parsed.competitions[0].durationDays, null);
  assert.ok(parsed.competitions[0].issues.some((issue) => issue.includes('vuosi')));
  assert.ok(parsed.competitions[0].issues.some((issue) => issue.includes('Alkamispäivä')));
  assert.ok(parsed.competitions[0].issues.some((issue) => issue.includes('Karjaa')));
  assert.equal(getPrimaryMunicipality(parsed.competitions[1]), null);
  assert.equal(getPrimaryMunicipality(parsed.competitions[2]), null);
  assert.equal(analyzeCompetitions(parsed.competitions, municipalities).unmappedCount, 3);
  assert.equal(getCompetitionsByMunicipality(parsed, 'Helsinki', {}, municipalities).length, 0);
  assert.equal(filterCompetitions(parsed, filters({ query: 'Historiallinen Karjaa' })).length, 1);
});

test('current Finnish and Swedish municipality names map; secondary locations stay searchable but are not primary counts', () => {
  const parsed = createCompetitionDataset({ competitions: [
    event({ municipalities: [
      { name: 'Helsinki', primary: true, courses: ['Keskuspuisto'] },
      { name: 'Espoo', primary: false, courses: ['Espoon rata'] },
    ] }),
  ] }, municipalities);
  const competition = parsed.competitions[0];
  assert.equal(competition.municipalities[0].municipalityCode, municipality('Helsinki').code);
  assert.equal(competition.municipalities[1].municipalityCode, municipality('Espoo').code);
  assert.equal(getPrimaryMunicipality(competition).name, 'Helsinki');
  assert.equal(getSecondaryMunicipalities(competition)[0].name, 'Espoo');
  assert.equal(getCompetitionsByMunicipality(parsed, 'Helsinki', {}, municipalities).length, 1);
  assert.equal(getCompetitionsByMunicipality(parsed, 'Helsingfors').length, 1);
  assert.equal(getCompetitionsByMunicipality(parsed, 'Esbo', {}, municipalities).length, 0);
  assert.equal(getCompetitionsByMunicipality(parsed, 'Esbo', { includePrimary: false, includeSecondary: true }, municipalities).length, 1);
  assert.equal(filterCompetitions(parsed, filters({ municipality: 'Helsingfors' }), undefined, municipalities).length, 1);
  assert.equal(filterCompetitions(parsed, filters({ municipality: 'Esbo' }), undefined, municipalities).length, 1);
  assert.deepEqual(getCompetitionCourses(competition).map((group) => group.courses), [['Keskuspuisto'], ['Espoon rata']]);

  const analysis = analyzeCompetitions(parsed.competitions, municipalities);
  assert.equal(analysis.primaryCounts.get(municipality('Helsinki').code), 1);
  assert.equal(analysis.primaryCounts.has(municipality('Espoo').code), false);
  assert.equal(analysis.associatedCounts.get(municipality('Espoo').code), 1);
});

test('year, visibility, model, organizer, tier, text and municipality filters compose correctly', () => {
  const parsed = createCompetitionDataset({ competitions: [
    event({ name: 'Kevät Open', year: 2024, organizer: 'Helsinki Disc Golf', pdgaTier: 'C-tier' }),
    event({ name: 'Syksy Open', year: 2025, organizer: 'Espoo Disc Golf', pdgaTier: 'B-tier',
      municipalities: [{ name: 'Espoo', primary: true, courses: ['Rantarata'] }] }),
    event({ name: 'Juhannus Open', year: 2025, competitionModel: 'Liiga', organizer: 'Helsinki Disc Golf' }),
  ] }, municipalities);
  assert.equal(filterCompetitions(parsed, filters({ visibility: 'hidden' })).length, 0);
  assert.equal(filterCompetitions(parsed, filters({ visibility: 'all', years: [] })).length, 3);
  assert.equal(filterCompetitions(parsed, filters({ visibility: 'years', years: [] })).length, 0);
  assert.equal(filterCompetitions(parsed, filters({ visibility: 'years', years: [2024, 2025] })).length, 3);
  assert.equal(filterCompetitions(parsed, filters({ visibility: 'years', years: [2024] })).length, 1);
  assert.equal(filterCompetitions(parsed, filters({ model: 'Liiga', organizer: 'Helsinki Disc Golf' })).length, 1);
  assert.equal(filterCompetitions(parsed, filters({ tier: 'B-tier', query: 'Rantarata' })).length, 1);
  assert.equal(filterCompetitions(parsed, filters({ query: 'Juhannus', municipality: 'Helsinki' })).length, 1);
  assert.equal(filterCompetitions(parsed, filters({ query: 'No match' })).length, 0);
  assert.equal(getCompetitionById(parsed, parsed.competitions[0].id), parsed.competitions[0]);
});

test('region primary hosting and associated coverage count each event once per overlapping region', () => {
  const parsed = createCompetitionDataset({ competitions: [
    event({ name: 'Helsinki–Espoo', municipalities: [
      { name: 'Helsinki', primary: true, courses: ['A'] }, { name: 'Espoo', primary: false, courses: ['B'] },
      { name: 'Esbo', primary: false, courses: ['B'] },
    ] }),
    event({ name: 'Espoo', municipalities: [{ name: 'Espoo', primary: true, courses: ['B'] }] }),
  ] }, municipalities);
  const region = (id, names) => ({
    id, municipalityCodes: names.map((name) => municipality(name).code),
  });
  const regions = [region('west', ['Helsinki', 'Espoo']), region('east', ['Espoo', 'Turku'])];
  const analysis = analyzeCompetitions(parsed.competitions, municipalities, regions);
  assert.equal(analysis.uniqueCount, 2);
  assert.equal(analysis.regionCounts.get('west'), 2);
  assert.equal(analysis.regionCounts.get('east'), 1);
  assert.equal(analysis.regionCoverageCounts.get('west'), 2);
  assert.equal(analysis.regionCoverageCounts.get('east'), 2);
  assert.equal(analysis.associatedCounts.get(municipality('Espoo').code), 2);
  assert.equal(getCompetitionsByRegion(parsed, 'east', regions).length, 1);
  assert.equal(getCompetitionsByRegion(parsed, 'east', regions, { includePrimary: true, includeSecondary: true }).length, 2);
  assert.equal(analysis.coveredCodes.size, 2);
  assert.equal(analysis.courses, 2);
  assert.equal(analysis.unmappedCount, 0);
});

test('year colors are subset-independent and unknown years have deterministic fallback colors', () => {
  const earlier = getCompetitionYearColor(2020);
  const later = getCompetitionYearColor(2026);
  assert.notEqual(earlier, later);
  assert.equal(getCompetitionYearColor(2020), earlier);
  assert.equal(getCompetitionYearColor(2050), getCompetitionYearColor(2050));
  assert.match(getCompetitionYearColor(2050), /^hsl\(/);
});

test('competition repository shares pending/successful requests and retries after failure', async () => {
  const firstDataset = parseMunicipalities(JSON.parse(await readFile(new URL('../public/geo/kunnat.geojson', import.meta.url), 'utf8')));
  let requests = 0;
  const fetcher = async (url) => {
    assert.equal(url, COMPETITION_URL);
    requests++;
    return requests === 1
      ? new Response('', { status: 503 })
      : Response.json({ competitions: [event()] });
  };
  await assert.rejects(competitionRepository.getCompetitions(firstDataset, fetcher), /503/);
  const [first, second] = await Promise.all([
    competitionRepository.getCompetitions(firstDataset, fetcher),
    competitionRepository.getCompetitions(firstDataset, fetcher),
  ]);
  assert.equal(first, second);
  assert.equal(first.competitions.length, 1);
  assert.equal(requests, 2);
  competitionRepository.clearCache(firstDataset);
});
