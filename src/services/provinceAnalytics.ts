import type { Club } from '../models/club.ts';
import type { CompetitionStatistics } from '../models/competition.ts';
import type { MunicipalityDataset } from '../models/region.ts';
import type { ProvinceDataset, ProvinceStatistics } from '../models/province.ts';
import { normalizeMunicipalityName } from './populationService.ts';

export function getProvinceCoverageIssues(provinces: ProvinceDataset, municipalities: MunicipalityDataset): string[] {
  const mapped = new Set(provinces.regions.map((province) => province.municipalityProvince));
  const unmatched = municipalities.municipalities.filter((municipality) => municipality.province && !mapped.has(municipality.province));
  const empty = provinces.regions.filter((province) =>
    !municipalities.municipalities.some((municipality) => municipality.province === province.municipalityProvince));
  const issues: string[] = [];
  if (unmatched.length) issues.push(`${unmatched.length} kuntaa ei kuulu regions.json-tiedoston maakuntiin.`);
  if (empty.length) issues.push(`${empty.length} maakunnalle ei löytynyt kuntia kuntarajojen aineistosta.`);
  const missing = municipalities.municipalities.filter((municipality) => !municipality.province).length;
  if (missing) issues.push(`${missing} kunnalta puuttuu maakuntatieto kuntarajojen aineistosta.`);
  return issues;
}

export function getProvinceStatistics(
  provinces: ProvinceDataset,
  municipalities: MunicipalityDataset,
  clubs: readonly Club[],
  municipalityByClub: ReadonlyMap<Club, string | null>,
  competitions: CompetitionStatistics | null,
): ProvinceStatistics[] {
  const competitionCounts = new Map((competitions?.municipalities ?? [])
    .map((item) => [normalizeMunicipalityName(item.name), item.count]));
  return provinces.regions.map((province) => {
    const members = municipalities.municipalities.filter((item) => item.province === province.municipalityProvince);
    const codes = new Set(members.map((item) => item.code));
    const regionalClubs = clubs.filter((club) => {
      const code = municipalityByClub.get(club);
      return code !== null && code !== undefined && codes.has(code);
    });
    const populationKnown = members.length > 0 && members.every((item) => item.population !== null);
    const population = populationKnown ? members.reduce((sum, item) => sum + (item.population ?? 0), 0) : null;
    const areaKm2 = members.reduce((sum, item) => sum + item.areaKm2, 0);
    const competitionCount = competitions && members.length > 0
      ? members.reduce((sum, item) => sum + (competitionCounts.get(normalizeMunicipalityName(item.name)) ?? 0), 0)
      : null;
    return {
      province,
      municipalityCount: members.length,
      population,
      areaKm2,
      clubs: regionalClubs.length,
      members: regionalClubs.reduce((sum, club) => sum + (club.jasenmaara ?? 0), 0),
      votes: regionalClubs.reduce((sum, club) => sum + (club.aanimaara ?? 0), 0),
      competitions: competitionCount,
      competitionDensity: competitionCount !== null && areaKm2 > 0 ? competitionCount / areaKm2 * 1000 : null,
      populationDensity: population !== null && areaKm2 > 0 ? population / areaKm2 : null,
    };
  });
}
