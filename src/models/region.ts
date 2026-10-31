export type Position = [number, number];
export type PolygonCoordinates = Position[][];

export interface MunicipalityGeometry {
  type: 'Polygon' | 'MultiPolygon';
  polygons: PolygonCoordinates[];
}

export interface Municipality {
  code: string;
  name: string;
  nameSv: string | null;
  province: string | null;
  population: number | null;
  areaKm2: number;
  bounds: [Position, Position];
  labelPoint: Position;
  geometry: MunicipalityGeometry;
}

export interface MunicipalityDataset {
  municipalities: Municipality[];
  byCode: Map<string, Municipality>;
  totalAreaKm2: number;
  source: string | null;
  license: string | null;
}

export interface Region {
  id: string;
  number: number;
  name: string;
  shortName: string;
  description: string;
  color: string;
  opacity: number;
  enabled: boolean;
  visible: boolean;
  municipalityCodes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  regions: Region[];
  createdAt: string;
  updatedAt: string;
}

export interface PlannerDocument {
  version: 1;
  activeScenarioId: string;
  scenarios: Scenario[];
}

export type RegionDraft = Partial<Omit<Region, 'id' | 'createdAt' | 'updatedAt'>>;

export interface Snapshot {
  id: string;
  createdAt: string;
  reason: string;
  document: PlannerDocument;
}

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';
