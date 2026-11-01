import type { Club, Database } from '../models/club';
import { getVotingPower } from '../services/membershipRules.ts';

const DATABASE_URL = './api/clubs.php';
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

const coreFields = new Set(['id', 'archived', 'contact', 'seura', 'paikkakunta', 'latitude', 'longitude', 'jasenmaara', 'aanimaara']);

function parseContact(value: unknown): Club['contact'] {
  if (!isRecord(value) || value.public !== true) return undefined;
  const fields = ['name', 'email', 'phone', 'website', 'instagram', 'tiktok'] as const;
  if (fields.some((field) => typeof value[field] !== 'string')) return undefined;
  return {
    name: value.name as string,
    email: value.email as string,
    phone: value.phone as string,
    website: value.website as string,
    instagram: value.instagram as string,
    tiktok: value.tiktok as string,
    public: true,
  };
}

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
  let mismatchedVotingPower = 0;
  let undeterminedVotingPower = 0;
  let invalidContacts = 0;
  for (const [index, item] of value.data.entries()) {
    if (!isRecord(item)) {
      skipped += 1;
      continue;
    }
    if (item.archived === true) continue;
    const seura = text(item.seura);
    const paikkakunta = text(item.paikkakunta);
    const lat = parseNumber(item.latitude);
    const lng = parseNumber(item.longitude);
    const latitude = lat !== null && lat >= -90 && lat <= 90 ? lat : null;
    const longitude = lng !== null && lng >= -180 && lng <= 180 ? lng : null;
    const jasenmaara = parseCount(item.jasenmaara);
    const sourceVotes = parseCount(item.aanimaara);
    const aanimaara = getVotingPower(jasenmaara);
    const contact = item.contact === undefined ? undefined : parseContact(item.contact);
    if (item.contact !== undefined && item.contact !== null && isRecord(item.contact) && item.contact.public === true && !contact) {
      invalidContacts += 1;
    }
    if (item.aanimaara !== undefined && item.aanimaara !== null) {
      if (jasenmaara === null) {
        if (sourceVotes !== null) undeterminedVotingPower += 1;
      } else if (sourceVotes !== aanimaara) {
        mismatchedVotingPower += 1;
      }
    }
    if (!seura || !paikkakunta || latitude === null || longitude === null || jasenmaara === null) {
      incomplete += 1;
    }
    const entries: [string, string | number][] = [];
    for (const [key, field] of Object.entries(item)) {
      if (!coreFields.has(key) && ((typeof field === 'string' && field.trim()) || (typeof field === 'number' && Number.isFinite(field)))) {
        entries.push([key, field]);
      }
    }
    data.push({
      ...(text(item.id) ? { id: text(item.id)! } : {}),
      seura: seura ?? `Nimetön seura (tietue ${index + 1})`,
      paikkakunta: paikkakunta ?? 'Paikkakunta puuttuu',
      latitude, longitude, jasenmaara, aanimaara, ...(contact ? { contact } : {}), details: Object.fromEntries(entries),
    });
  }

  if (recordCount !== null && recordCount !== value.data.length) {
    warnings.push(`Metadata ilmoittaa ${recordCount} tietuetta, mutta data-taulukossa on ${value.data.length}. Kaikki taulukon seurat käsitellään.`);
  }
  if (skipped) warnings.push(`${skipped} virheellistä tietuetta ohitettiin, koska ne eivät ole JSON-objekteja.`);
  if (incomplete) {
    warnings.push(`${incomplete} seuran tiedot ovat puutteelliset. Tuntemattomia jäsenmääriä ei lasketa nolliksi eikä niiden äänivaltaa voida päätellä; ilman koordinaatteja olevat seurat näkyvät vain luettelossa ja tilastoissa.`);
  }
  if (mismatchedVotingPower) {
    warnings.push(`${mismatchedVotingPower} seuran lähdeaineiston äänimäärä poikkeaa jäsenmäärään perustuvasta äänivallasta. Sovellus käyttää määritelmän mukaista laskettua arvoa.`);
  }
  if (undeterminedVotingPower) {
    warnings.push(`${undeterminedVotingPower} seuran lähdeaineiston äänimäärää ei voida tarkistaa, koska jäsenmäärä puuttuu. Sovellus näyttää äänivallan tuntemattomana.`);
  }
  if (invalidContacts) {
    warnings.push(`${invalidContacts} seuran julkisia yhteystietoja ei voitu käsitellä virheellisen tietorakenteen vuoksi.`);
  }
  return { metadata: { generatedAt, recordCount, source }, data, warnings };
}

async function loadDatabase(): Promise<Database> {
  const response = await fetch(DATABASE_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Seuratietoja ei voitu ladata (${response.status}). Varmista, että seuratietopalvelu on käytettävissä.`);
  }
  return parseDatabase(await response.json() as unknown);
}

function getDatabase(): Promise<Database> {
  databaseRequest ??= loadDatabase().catch((error: unknown) => {
    databaseRequest = undefined;
    throw error;
  });
  return databaseRequest;
}

export const clubRepository = {
  getDatabase,
  refresh(): Promise<Database> {
    databaseRequest = undefined;
    return getDatabase();
  },
};
