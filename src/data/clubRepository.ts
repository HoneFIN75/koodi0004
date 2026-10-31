import type { Club, Database } from '../models/club';

const DATABASE_URL = '/jsondb/seurat.json';
let databaseRequest: Promise<Database> | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseNumber(value: unknown): number | null {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value.replace(/\s/g, ''))
      : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCount(value: unknown): number | null {
  const count = parseNumber(value);
  return count !== null && Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const coreFields = new Set(['seura', 'paikkakunta', 'latitude', 'longitude', 'jasenmaara', 'aanimaara']);

export function parseDatabase(value: unknown): Database {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    throw new Error('JSON-tietokannan rakenne ei vastaa odotettua muotoa.');
  }
  const warnings: string[] = [];
  const metadata = isRecord(value.metadata) ? value.metadata : {};
  const date = text(metadata.generatedAt);
  const generatedAt = date && Number.isFinite(Date.parse(date)) ? date : null;
  const recordCount = parseCount(metadata.recordCount);
  const source = text(metadata.source);
  if (generatedAt === null || recordCount === null || source === null) {
    warnings.push('Metadata on puutteellinen. Tilastot lasketaan data-taulukon tietueista.');
  }

  const data: Club[] = [];
  let skipped = 0;
  let incomplete = 0;
  for (const [index, item] of value.data.entries()) {
    if (!isRecord(item)) {
      skipped += 1;
      continue;
    }
    const seura = text(item.seura);
    const paikkakunta = text(item.paikkakunta);
    const lat = parseNumber(item.latitude);
    const lng = parseNumber(item.longitude);
    const latitude = lat !== null && lat >= -90 && lat <= 90 ? lat : null;
    const longitude = lng !== null && lng >= -180 && lng <= 180 ? lng : null;
    const jasenmaara = parseCount(item.jasenmaara);
    const aanimaara = parseCount(item.aanimaara);
    if (!seura || !paikkakunta || latitude === null || longitude === null || jasenmaara === null || aanimaara === null) {
      incomplete += 1;
    }
    const entries: [string, string | number][] = [];
    for (const [key, field] of Object.entries(item)) {
      if (!coreFields.has(key) && ((typeof field === 'string' && field.trim()) || (typeof field === 'number' && Number.isFinite(field)))) {
        entries.push([key, field]);
      }
    }
    data.push({
      seura: seura ?? `Nimetön seura (tietue ${index + 1})`,
      paikkakunta: paikkakunta ?? 'Paikkakunta puuttuu',
      latitude, longitude, jasenmaara, aanimaara, details: Object.fromEntries(entries),
    });
  }

  if (recordCount !== null && recordCount !== value.data.length) {
    warnings.push(`Metadata ilmoittaa ${recordCount} tietuetta, mutta data-taulukossa on ${value.data.length}. Kaikki taulukon seurat käsitellään.`);
  }
  if (skipped) warnings.push(`${skipped} virheellistä tietuetta ohitettiin, koska ne eivät ole JSON-objekteja.`);
  if (incomplete) {
    warnings.push(`${incomplete} seuran tiedot ovat puutteelliset. Tuntemattomia lukumääriä ei lasketa nolliksi; ilman koordinaatteja olevat seurat näkyvät vain luettelossa ja tilastoissa.`);
  }
  return { metadata: { generatedAt, recordCount, source }, data, warnings };
}

async function loadDatabase(): Promise<Database> {
  const response = await fetch(DATABASE_URL);
  if (!response.ok) {
    throw new Error(`Seuratietokantaa ei voitu ladata (${response.status}). Tarkista, että ${DATABASE_URL} on julkaistu.`);
  }
  return parseDatabase(await response.json() as unknown);
}

export const clubRepository = {
  getDatabase(): Promise<Database> {
    databaseRequest ??= loadDatabase().catch((error: unknown) => {
      databaseRequest = undefined;
      throw error;
    });
    return databaseRequest;
  },
};
