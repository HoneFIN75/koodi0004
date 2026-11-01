import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parseProvinceDataset } from '../src/data/provinceRepository.ts';
import { parseMunicipalities } from '../src/data/municipalityRepository.ts';
import { parseDatabase } from '../src/data/clubRepository.ts';
import { parseCompetitions, indexCompetitions, getCompetitionStatistics } from '../src/services/competitionService.ts';
import { assignClubs } from '../src/services/regionAnalytics.ts';
import { getProvinceCoverageIssues, getProvinceStatistics } from '../src/services/provinceAnalytics.ts';
import { DEFAULT_PROVINCE_SETTINGS, parseProvinceSettings } from '../src/services/provinceSettings.ts';

const regions = parseProvinceDataset(JSON.parse(await readFile(new URL('../jsondb/regions.json', import.meta.url), 'utf8')));
const geography = parseMunicipalities(JSON.parse(await readFile(new URL('../public/geo/kunnat.geojson', import.meta.url), 'utf8')));
const database = parseDatabase(JSON.parse(await readFile(new URL('../jsondb/seurat.json', import.meta.url), 'utf8')));

test('province definitions are unique, colored and cover every municipality exactly once', () => {
  assert.equal(regions.regions.length, 19);
  assert.equal(new Set(regions.regions.map(({ id }) => id)).size, 19);
  assert.equal(new Set(regions.regions.map(({ color }) => color)).size, 19);
  assert.deepEqual(getProvinceCoverageIssues(regions, geography), []);
  const mappedCount = regions.regions.reduce((count, province) => count + geography.municipalities
    .filter((municipality) => municipality.province === province.municipalityProvince).length, 0);
  assert.equal(mappedCount, geography.municipalities.length);
});

test('province parser rejects duplicate identifiers, duplicate mappings and invalid colors', () => {
  const valid = { metadata: { version: 1 }, regions: [{ id: 'one', name: 'One', color: '#123456', municipalityProvince: 'Province One' }] };
  assert.throws(() => parseProvinceDataset({ ...valid, regions: [...valid.regions, valid.regions[0]] }), /yksilöllinen/);
  assert.throws(() => parseProvinceDataset({ ...valid, regions: [...valid.regions, { ...valid.regions[0], id: 'two', name: 'Two' }] }), /yksilöllinen/);
  assert.throws(() => parseProvinceDataset({ ...valid, regions: [{ ...valid.regions[0], color: 'red' }] }), /rivi 1/);
  assert.throws(() => parseProvinceDataset({ metadata: {}, regions: valid.regions }), /versio/);
});

test('province statistics aggregate clubs, members, voting power, population and competitions', () => {
  const placements = assignClubs(database.data, geography);
  const clubsByMunicipality = new Map(placements.map(({ club, municipalityCode }) => [club, municipalityCode]));
  const competitionIndex = indexCompetitions(parseCompetitions([
    { 'Kilpailun nimi': 'Helsinki Open', Vuosi: 2025, Kunta: 'Helsinki' },
    { 'Kilpailun nimi': 'Helsinki Open 2', Vuosi: 2025, Kunta: 'Helsinki' },
    { 'Kilpailun nimi': 'Unknown venue', Vuosi: 2025, Kunta: 'Tuntematon' },
  ]));
  const competitionStats = getCompetitionStatistics(competitionIndex, { mode: 'all' }, {}, geography.municipalities);
  const stats = getProvinceStatistics(regions, geography, database.data, clubsByMunicipality, competitionStats);
  const uusimaa = stats.find(({ province }) => province.id === 'uusimaa');
  assert.ok(uusimaa);
  assert.equal(uusimaa.competitions, 2);
  assert.ok(uusimaa.municipalityCount > 0);
  assert.ok(uusimaa.population > 0);
  assert.ok(uusimaa.clubs > 0);
  assert.equal(stats.reduce((sum, item) => sum + item.clubs, 0), database.data.length);
  assert.equal(stats.reduce((sum, item) => sum + item.members, 0), database.data.reduce((sum, club) => sum + (club.jasenmaara ?? 0), 0));
});

test('province overlay settings restore safe defaults and clamp stored opacity', () => {
  assert.deepEqual(parseProvinceSettings(null), DEFAULT_PROVINCE_SETTINGS);
  assert.deepEqual(parseProvinceSettings({ showRegions: false, regionOpacity: 1.5, showRegionBorders: false }), {
    showRegions: false, regionOpacity: 1, showRegionBorders: false,
  });
  assert.equal(parseProvinceSettings({ regionOpacity: -1 }).regionOpacity, 0);
});
