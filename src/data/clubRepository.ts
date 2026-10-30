import type { Club, Database } from '../models/club';

const DATABASE_URL = '/jsondb/seurat.json';
let databaseRequest: Promise<Database> | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseCount(value: unknown, field: string, index: number): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value.replace(/\u00a0/g, ' ').trim())
      : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Virheellinen ${field} seuran ${index + 1} tiedoissa.`);
  }
  return parsed;
}

function parseDatabase(value: unknown): Database {
  if (!isRecord(value) || !isRecord(value.metadata) || !Array.isArray(value.data)) {
    throw new Error('JSON-tietokannan rakenne ei vastaa odotettua muotoa.');
  }
  const { generatedAt, recordCount, source } = value.metadata;
  if (typeof generatedAt !== 'string' || typeof recordCount !== 'number' || typeof source !== 'string') {
    throw new Error('JSON-tietokannan metadata on virheellinen.');
  }

  const data = value.data.map((item, index): Club => {
    if (!isRecord(item)
      || typeof item.seura !== 'string'
      || typeof item.paikkakunta !== 'string'
      || typeof item.latitude !== 'number'
      || typeof item.longitude !== 'number'
      || !Number.isFinite(item.latitude)
      || !Number.isFinite(item.longitude)
      || item.latitude < -90 || item.latitude > 90
      || item.longitude < -180 || item.longitude > 180) {
      throw new Error(`Seuran ${index + 1} tiedot ovat virheelliset.`);
    }
    return {
      seura: item.seura,
      paikkakunta: item.paikkakunta,
      latitude: item.latitude,
      longitude: item.longitude,
      jasenmaara: parseCount(item.jasenmaara, 'jäsenmäärä', index),
      aanimaara: parseCount(item.aanimaara, 'äänimäärä', index),
    };
  });

  if (recordCount !== data.length) {
    throw new Error(`Tietokannan ilmoitettu tietuemäärä (${recordCount}) ei vastaa aineistoa (${data.length}).`);
  }
  return { metadata: { generatedAt, recordCount, source }, data };
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
