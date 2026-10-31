import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseMunicipalities } from '../src/data/municipalityRepository.ts';
import { createCompetitionDataset } from '../src/data/competitionRepository.ts';
import { analyzeCompetitions, getCompetitionYearColor, getPrimaryMunicipality, getCompetitionIdentifierBase } from '../src/services/competitionService.ts';
import { normalizeMunicipalityName } from '../src/services/populationService.ts';

const source = await readFile(new URL('../public/data/SFL-Kilpailut_lopullinen.json', import.meta.url));
const municipalities = parseMunicipalities(JSON.parse(await readFile(new URL('../public/geo/kunnat.geojson', import.meta.url), 'utf8')));
const data = createCompetitionDataset(JSON.parse(source.toString('utf8')), municipalities);
const stats = analyzeCompetitions(data.competitions, municipalities);
const unresolved = new Map();
const identities = new Map();
const identifierBases = new Map();
for (const competition of data.competitions) {
  const fields = [competition.name, competition.year, competition.startDate, competition.endDate, getPrimaryMunicipality(competition)?.name ?? '', competition.organizer];
  const key = JSON.stringify(fields.map((field) => typeof field === 'string' ? normalizeMunicipalityName(field) : field));
  const entries = identities.get(key) ?? [];
  entries.push({ sourceIndex: competition.sourceIndex, competitionId: competition.id, name: competition.name });
  identities.set(key, entries);
  const base = getCompetitionIdentifierBase(competition);
  const group = identifierBases.get(base) ?? [];
  group.push({ sourceIndex: competition.sourceIndex, competitionId: competition.id, name: competition.name });
  identifierBases.set(base, group);
}
for (const competition of data.competitions) for (const location of competition.municipalities) {
  if (location.municipalityCode) continue;
  const indexes = unresolved.get(location.name) ?? new Set();
  indexes.add(competition.sourceIndex);
  unresolved.set(location.name, indexes);
}
const report = {
  source: 'public/data/SFL-Kilpailut_lopullinen.json',
  sha256: createHash('sha256').update(source).digest('hex'),
  sourceIndexConvention: 'Nollapohjainen competitions-taulukon indeksi; käyttöliittymän rivi on sourceIndex + 1.',
  recordCount: data.competitions.length,
  uniqueIdentifiers: data.byId.size,
  repeatedIdentityFields: [...identities.values()].filter((entries) => entries.length > 1),
  identifierBaseCollisions: [...identifierBases].filter(([, entries]) => entries.length > 1).map(([base, records]) => ({ base, records })),
  multiMunicipalityCount: data.competitions.filter((item) => item.municipalities.length > 1).length,
  primaryCountIssues: data.competitions.filter((item) => !getPrimaryMunicipality(item)).map((item) => item.sourceIndex),
  mapEligibleCount: data.competitions.length - stats.unmappedCount,
  coveredMunicipalityCount: stats.coveredCodes.size,
  coveredPopulation: stats.coveredPopulation,
  courseCount: stats.courses,
  years: data.years.map((year) => ({ year, count: data.byYear.get(year)?.length ?? 0, color: getCompetitionYearColor(year) })),
  unresolvedMunicipalities: [...unresolved].sort(([a], [b]) => a.localeCompare(b, 'fi')).map(([name, indexes]) => ({ name, sourceIndexes: [...indexes] })),
  aliasResolutions: data.aliasResolutions,
  missingYearIndexes: data.competitions.filter((item) => item.year === null).map((item) => item.sourceIndex),
  nonCalculableDurationIndexes: data.competitions.filter((item) => item.durationDays === null).map((item) => item.sourceIndex),
  conflictingDivisionIndexes: data.competitions.filter((item) => item.divisionType === 'Pro- ja amatööriluokat, Vain pro-luokkia').map((item) => item.sourceIndex),
  issueCount: data.issues.length,
  issues: data.issues,
};
await writeFile(new URL('../COMPETITION-DATA-QUALITY.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, issues: `${report.issueCount} huomautusta; täydellinen luettelo COMPETITION-DATA-QUALITY.json`, nonCalculableDurationIndexes: report.nonCalculableDurationIndexes.length }, null, 2));
