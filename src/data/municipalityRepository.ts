import type { Municipality, MunicipalityDataset, MunicipalityGeometry, PolygonCoordinates, Position } from '../models/region';
import { geometryAreaKm2, geometryBounds, geometryLabelPoint } from '../services/geoService.ts';
import { populationService } from '../services/populationService.ts';

export const MUNICIPALITY_URL = './geo/kunnat.geojson';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isPosition = (value: unknown): value is Position => Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);

function parsePolygon(value: unknown): PolygonCoordinates | null {
  if (!Array.isArray(value)) return null;
  const rings = value.filter((ring): ring is unknown[] => Array.isArray(ring))
    .map((ring) => ring.filter(isPosition).map(([lng, lat]) => [lng, lat] as Position))
    .filter((ring) => ring.length >= 4);
  return rings.length > 0 ? rings : null;
}

function parseGeometry(value: unknown): MunicipalityGeometry | null {
  if (!isRecord(value)) return null;
  if (value.type === 'Polygon') {
    const polygon = parsePolygon(value.coordinates);
    return polygon ? { type: 'Polygon', polygons: [polygon] } : null;
  }
  if (value.type === 'MultiPolygon' && Array.isArray(value.coordinates)) {
    const polygons = value.coordinates.map(parsePolygon).filter((polygon): polygon is PolygonCoordinates => polygon !== null);
    return polygons.length > 0 ? { type: 'MultiPolygon', polygons } : null;
  }
  return null;
}

const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
const count = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

export function parseMunicipalities(input: unknown): MunicipalityDataset {
  if (!isRecord(input) || !Array.isArray(input.features)) throw new Error('Kuntarajojen aineisto on virheellinen.');
  const municipalities: Municipality[] = [];
  const byCode = new Map<string, Municipality>();
  for (const feature of input.features) {
    if (!isRecord(feature)) continue;
    const properties = isRecord(feature.properties) ? feature.properties : {};
    const name = text(properties.name) ?? text(properties.nimi);
    const code = text(String(properties.code ?? properties.kunta ?? '')) ?? name;
    const geometry = parseGeometry(feature.geometry);
    if (!name || !code || !geometry || byCode.has(code)) continue;
    const municipality: Municipality = {
      code, name,
      nameSv: text(properties.nameSv) ?? text(properties.namn),
      province: text(properties.province) ?? text(properties.maakunta),
      population: count(properties.population) ?? count(properties.vaesto),
      areaKm2: geometryAreaKm2(geometry),
      bounds: geometryBounds(geometry),
      labelPoint: geometryLabelPoint(geometry),
      geometry,
    };
    municipalities.push(municipality);
    byCode.set(code, municipality);
  }
  if (municipalities.length === 0) throw new Error('Kuntarajojen aineistossa ei ole kelvollisia kuntia.');
  municipalities.sort((a, b) => a.name.localeCompare(b.name, 'fi'));
  populationService.registerNames(municipalities);
  for (const municipality of municipalities) {
    municipality.population = populationService.getMunicipalityPopulation(municipality.name);
  }
  const metadata = isRecord(input.metadata) ? input.metadata : {};
  return {
    municipalities, byCode,
    totalAreaKm2: municipalities.reduce((sum, municipality) => sum + municipality.areaKm2, 0),
    source: text(metadata.source), license: text(metadata.license),
  };
}

let cached: Promise<MunicipalityDataset> | null = null;

export const municipalityRepository = {
  getMunicipalities(fetcher: typeof fetch = fetch): Promise<MunicipalityDataset> {
    cached ??= fetcher(MUNICIPALITY_URL, { cache: 'no-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`Kuntarajoja ei voitu ladata (HTTP ${response.status}).`);
        return response.json();
      })
      .then(parseMunicipalities)
      .catch((error: unknown) => { cached = null; throw error; });
    return cached;
  },
};
