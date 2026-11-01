import type { MunicipalityDataset } from './region.ts';

export interface ProvinceDefinition {
  id: string;
  name: string;
  color: string;
  municipalityProvince: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface ProvinceDataset {
  version: number;
  source: string | null;
  regions: ProvinceDefinition[];
  byId: Map<string, ProvinceDefinition>;
}

export interface ProvinceStatistics {
  province: ProvinceDefinition;
  municipalityCount: number;
  population: number | null;
  areaKm2: number;
  clubs: number;
  members: number;
  votes: number;
  competitions: number | null;
  competitionDensity: number | null;
  populationDensity: number | null;
}

export interface ProvinceOverlaySettings {
  showRegions: boolean;
  regionOpacity: number;
  showRegionBorders: boolean;
}

export type ProvinceMetrics = keyof Pick<ProvinceStatistics,
  'municipalityCount' | 'population' | 'areaKm2' | 'clubs' | 'members' | 'votes' |
  'competitions' | 'competitionDensity' | 'populationDensity'>;

export function provinceMunicipalities(
  dataset: MunicipalityDataset,
  province: ProvinceDefinition,
) {
  return dataset.municipalities.filter((municipality) => municipality.province === province.municipalityProvince);
}
