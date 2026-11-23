// Normalises Statistics Finland municipality boundaries (kunta1000k, EPSG:4326) for the region planner.
// Usage: node scripts/build-municipalities.mjs <input.geojson|url> [output]
import { readFile, writeFile } from 'node:fs/promises';

const DEFAULT_SOURCE = 'https://geo.stat.fi/geoserver/tilastointialueet/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=tilastointialueet:kunta1000k_2025&outputFormat=application/json&srsName=EPSG:4326';
const input = process.argv[2] ?? DEFAULT_SOURCE;
const output = process.argv[3] ?? new URL('../public/geo/kunnat.geojson', import.meta.url);

const raw = /^https?:/.test(input) ? await (await fetch(input)).text() : await readFile(input, 'utf8');
const source = JSON.parse(raw);
const round = (value) => Math.round(value * 1e4) / 1e4;
const roundCoordinates = (coordinates) => typeof coordinates[0] === 'number' ? coordinates.map(round) : coordinates.map(roundCoordinates);

const features = source.features
  .filter((feature) => feature?.geometry && ['Polygon', 'MultiPolygon'].includes(feature.geometry.type))
  .map((feature) => {
    const properties = feature.properties ?? {};
    return {
      type: 'Feature',
      properties: {
        code: String(properties.kunta ?? properties.code ?? '').padStart(3, '0'),
        name: properties.nimi ?? properties.name,
        nameSv: properties.namn ?? null,
        province: properties.province ?? properties.maakunta ?? null,
        population: typeof properties.population === 'number' ? properties.population : null,
        year: properties.vuosi ?? null,
      },
      geometry: { type: feature.geometry.type, coordinates: roundCoordinates(feature.geometry.coordinates) },
    };
  })
  .sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'fi'));

await writeFile(output, JSON.stringify({
  type: 'FeatureCollection',
  metadata: {
    source: 'Tilastokeskus, Kuntapohjaiset tilastointialueet (kunta1000k_2025)',
    license: 'CC BY 4.0',
    generatedAt: new Date().toISOString(),
    count: features.length,
  },
  features,
}));
console.log(`Wrote ${features.length} municipalities`);
