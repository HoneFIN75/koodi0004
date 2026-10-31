import { readFile, writeFile } from 'node:fs/promises';

const boundaries = JSON.parse(await readFile(new URL('../public/geo/kunnat.geojson', import.meta.url), 'utf8'));
const names = boundaries.features.map(({ properties }) => ({ name: properties.name, nameSv: properties.nameSv }))
  .filter(({ name, nameSv }) => nameSv && name !== nameSv);
await writeFile(new URL('../src/data/municipality-names.json', import.meta.url), `${JSON.stringify(names, null, 2)}\n`);
console.log(`Generated ${names.length} bilingual municipality names from the boundary dataset.`);
