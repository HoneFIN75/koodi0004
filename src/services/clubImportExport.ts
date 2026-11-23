import { getVotingPower } from './membershipRules.ts';

export interface ClubFileRecord {
  id: string;
  seura: string;
  paikkakunta: string;
  latitude: number | null;
  longitude: number | null;
  jasenmaara: number | null;
  aanimaara: number | null;
  contact: {
    name: string;
    email: string;
    phone: string;
    website: string;
    instagram: string;
    tiktok: string;
    public: boolean;
  };
  details: Record<string, string | number>;
  archived: boolean;
}

export interface ClubFile {
  format: 'seurakartta-clubs';
  version: 1;
  exportedAt: string;
  clubs: ClubFileRecord[];
}

export type ClubImportMode = 'merge' | 'new' | 'replace';

export interface ClubImportSummary {
  added: number;
  updated: number;
  unchanged: number;
  skipped: number;
  archived: number;
  restored: number;
  removed: number;
}

export interface ClubImportPlan {
  data: ClubFileRecord[];
  summary: ClubImportSummary;
}

const recordFields = new Set([
  'id', 'seura', 'paikkakunta', 'latitude', 'longitude', 'jasenmaara',
  'aanimaara', 'contact', 'details', 'archived',
]);
const contactFields = ['name', 'email', 'phone', 'website', 'instagram', 'tiktok', 'public'] as const;
const emptySummary = (): ClubImportSummary => ({
  added: 0, updated: 0, unchanged: 0, skipped: 0, archived: 0, restored: 0, removed: 0,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validText(value: unknown, maximum: number, required = false): value is string {
  return typeof value === 'string' && new TextEncoder().encode(value).length <= maximum && (!required || value.trim() !== '');
}

function validUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validEmail(value: string): boolean {
  if (!value) return true;
  const [local, domain, ...extra] = value.split('@');
  if (!local || !domain || extra.length > 0 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  return /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)
    && domain.split('.').every((part) => part.length > 0 && part.length <= 63
      && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(part))
    && domain.includes('.');
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('fi');
}

function identity(club: Pick<ClubFileRecord, 'seura' | 'paikkakunta'>): string {
  return `${normalize(club.seura)}\0${normalize(club.paikkakunta)}`;
}

function validateRecord(value: unknown, index: number, errors: string[], warnings: string[]): ClubFileRecord | null {
  const label = `Seura ${index + 1}`;
  if (!isRecord(value)) {
    errors.push(`${label}: tietueen tulee olla JSON-objekti.`);
    return null;
  }
  const unknownFields = Object.keys(value).filter((key) => !recordFields.has(key));
  if (unknownFields.length) errors.push(`${label}: tuntemattomat kentät ${unknownFields.join(', ')}; sijoita lisätiedot details-kenttään.`);
  if (!validText(value.id, 100, true) || !/^[A-Za-z0-9_-]{1,100}$/.test(value.id)) errors.push(`${label}: id puuttuu tai ei ole kelvollinen.`);
  if (!validText(value.seura, 200, true)) errors.push(`${label}: seuran nimi puuttuu tai ylittää 200 merkkiä.`);
  if (!validText(value.paikkakunta, 200, true)) errors.push(`${label}: paikkakunta puuttuu tai ylittää 200 merkkiä.`);

  for (const [field, minimum, maximum] of [['latitude', -90, 90], ['longitude', -180, 180]] as const) {
    const coordinate = value[field];
    if (coordinate !== null && (typeof coordinate !== 'number' || !Number.isFinite(coordinate) || coordinate < minimum || coordinate > maximum)) {
      errors.push(`${label}: ${field} tulee olla ${minimum}–${maximum} tai null.`);
    }
  }
  const members = value.jasenmaara;
  if (members !== null && (typeof members !== 'number' || !Number.isSafeInteger(members) || members < 0)) {
    errors.push(`${label}: jasenmaara tulee olla ei-negatiivinen kokonaisluku tai null.`);
  }
  const votes = value.aanimaara;
  if (votes !== null && (typeof votes !== 'number' || !Number.isSafeInteger(votes) || votes < 0)) {
    errors.push(`${label}: aanimaara tulee olla ei-negatiivinen kokonaisluku tai null.`);
  }
  const expectedVotes = typeof members === 'number' && Number.isSafeInteger(members) && members >= 0 ? getVotingPower(members) : null;
  if (votes !== expectedVotes) warnings.push(`${label}: aanimaara lasketaan tuonnissa jäsenmäärän perusteella.`);
  if (typeof value.archived !== 'boolean') errors.push(`${label}: archived tulee olla true tai false.`);

  const contact = value.contact;
  if (!isRecord(contact)) {
    errors.push(`${label}: contact-objekti puuttuu.`);
  } else {
    const missing = contactFields.filter((field) => !(field in contact));
    const unexpected = Object.keys(contact).filter((field) => !contactFields.includes(field as typeof contactFields[number]));
    if (missing.length) errors.push(`${label}: contact-kentät puuttuvat: ${missing.join(', ')}.`);
    if (unexpected.length) errors.push(`${label}: tuntemattomat contact-kentät: ${unexpected.join(', ')}.`);
    for (const [field, max] of [['name', 200], ['email', 254], ['phone', 50], ['website', 2048], ['instagram', 2048], ['tiktok', 2048]] as const) {
      if (!validText(contact[field], max)) errors.push(`${label}: contact.${field} ei ole kelvollinen (enintään ${max} merkkiä).`);
    }
    if (typeof contact.public !== 'boolean') errors.push(`${label}: contact.public tulee olla true tai false.`);
    if (typeof contact.email === 'string' && !validEmail(contact.email)) {
      errors.push(`${label}: sähköpostiosoite ei ole kelvollinen.`);
    }
    for (const field of ['website', 'instagram', 'tiktok'] as const) {
      if (typeof contact[field] === 'string' && !validUrl(contact[field])) errors.push(`${label}: ${field} sallii vain kelvollisen HTTP(S)-osoitteen.`);
    }
  }

  const details = value.details;
  if (!isRecord(details) || Object.keys(details).length > 100) {
    errors.push(`${label}: details tulee olla enintään 100 avain-arvo-parin objekti.`);
  } else {
    for (const [key, detail] of Object.entries(details)) {
      const validDetail = (typeof detail === 'string' && detail.length <= 2000)
        || (typeof detail === 'number' && Number.isFinite(detail));
      if (!key || new TextEncoder().encode(key).length > 100 || !validDetail) errors.push(`${label}: details.${key || '(tyhjä avain)'} ei ole kelvollinen skalaariarvo.`);
    }
  }

  if (errors.some((error) => error.startsWith(`${label}:`))) return null;
  return {
    id: value.id as string,
    seura: (value.seura as string).trim(),
    paikkakunta: (value.paikkakunta as string).trim(),
    latitude: value.latitude as number | null,
    longitude: value.longitude as number | null,
    jasenmaara: members as number | null,
    aanimaara: expectedVotes,
    contact: {
      name: (contact as ClubFileRecord['contact']).name.trim(),
      email: (contact as ClubFileRecord['contact']).email.trim(),
      phone: (contact as ClubFileRecord['contact']).phone.trim(),
      website: (contact as ClubFileRecord['contact']).website.trim(),
      instagram: (contact as ClubFileRecord['contact']).instagram.trim(),
      tiktok: (contact as ClubFileRecord['contact']).tiktok.trim(),
      public: (contact as ClubFileRecord['contact']).public,
    },
    details: details as Record<string, string | number>,
    archived: value.archived as boolean,
  };
}

export function exportClubFile(clubs: ClubFileRecord[], includeArchived: boolean): ClubFile {
  return {
    format: 'seurakartta-clubs',
    version: 1,
    exportedAt: new Date().toISOString(),
    clubs: clubs.filter((club) => includeArchived || !club.archived).map((club) => structuredClone(club)),
  };
}

export function parseClubFile(value: unknown): { clubs: ClubFileRecord[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRecord(value)) throw new Error('JSON-tiedoston juuren tulee olla objekti.');
  if (value.format !== 'seurakartta-clubs') errors.push('Tiedostomuodon tunnisteen tulee olla seurakartta-clubs.');
  if (value.version !== 1) errors.push(`Tiedostoversiota ${String(value.version)} ei tueta. Tuettu versio on 1.`);
  if (typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt))) errors.push('exportedAt puuttuu tai ei ole kelvollinen päivämäärä.');
  const unknownFields = Object.keys(value).filter((field) => !['format', 'version', 'exportedAt', 'clubs'].includes(field));
  if (unknownFields.length) errors.push(`Tiedostossa on tuntemattomia juurikenttiä: ${unknownFields.join(', ')}.`);
  if (!Array.isArray(value.clubs)) errors.push('clubs-kentän tulee olla taulukko.');
  if (Array.isArray(value.clubs) && value.clubs.length > 10000) errors.push('Tiedosto ylittää sallitun 10 000 seuran rajan.');
  const clubs = Array.isArray(value.clubs)
    ? value.clubs.map((club, index) => validateRecord(club, index, errors, warnings)).filter((club): club is ClubFileRecord => club !== null)
    : [];
  const ids = new Set<string>();
  for (const club of clubs) {
    if (ids.has(club.id)) errors.push(`Tiedostossa on toistuva seura-ID: ${club.id}.`);
    ids.add(club.id);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return { clubs, warnings: [...new Set(warnings)] };
}

function equalClub(left: ClubFileRecord, right: ClubFileRecord): boolean {
  const stable = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (!isRecord(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  };
  return stable(left) === stable(right);
}

export function planClubImport(current: ClubFileRecord[], incoming: ClubFileRecord[], mode: ClubImportMode): ClubImportPlan {
  const summary = emptySummary();
  const currentById = new Map(current.map((club) => [club.id, club]));
  const currentByIdentity = new Map<string, ClubFileRecord[]>();
  for (const club of current) currentByIdentity.set(identity(club), [...(currentByIdentity.get(identity(club)) ?? []), club]);
  const conflicts: string[] = [];

  if (mode === 'replace') {
    const nextById = new Map(incoming.map((club) => [club.id, club]));
    const incomingByIdentity = new Map<string, ClubFileRecord[]>();
    for (const club of incoming) incomingByIdentity.set(identity(club), [...(incomingByIdentity.get(identity(club)) ?? []), club]);
    for (const [identityKey, duplicates] of incomingByIdentity) {
      if (duplicates.length < 2) continue;
      const currentMatches = currentByIdentity.get(identityKey) ?? [];
      const existingIds = new Set(currentMatches.map((club) => club.id));
      if (duplicates.some((club) => !existingIds.has(club.id))) {
        conflicts.push(`Tiedostossa on useita seuroja samalla nimellä ja paikkakunnalla (${duplicates[0].seura} / ${duplicates[0].paikkakunta}); tunnisteet eivät vastaa nykyisiä seuroja.`);
      }
    }
    for (const club of incoming) {
      const existing = currentById.get(club.id);
      if (!existing) summary.added += 1;
      else if (!equalClub(existing, club)) {
        summary.updated += 1;
        if (!existing.archived && club.archived) summary.archived += 1;
        if (existing.archived && !club.archived) summary.restored += 1;
      } else summary.unchanged += 1;
      const matching = currentByIdentity.get(identity(club)) ?? [];
      if (!existing && matching.length > 0) conflicts.push(`"${club.seura}" / ${club.paikkakunta} vastaa nykyistä seuraa eri ID:llä.`);
    }
    summary.removed = current.filter((club) => !nextById.has(club.id)).length;
    if (conflicts.length) throw new Error(conflicts.join('\n'));
    return { data: incoming.map((club) => structuredClone(club)), summary };
  }

  const additionsByIdentity = new Map<string, string[]>();
  const next = new Map(current.map((club) => [club.id, club]));
  for (const club of incoming) {
    const existing = currentById.get(club.id);
    const identityKey = identity(club);
    const sameNameTown = currentByIdentity.get(identityKey) ?? [];
    if (mode === 'new') {
      if (existing || sameNameTown.length > 0) {
        if (!existing && sameNameTown.length > 1) conflicts.push(`"${club.seura}" / ${club.paikkakunta} vastaa useaa nykyistä seuraa; tunnistetta ei voida päätellä turvallisesti.`);
        summary.skipped += 1;
        continue;
      }
      const pending = additionsByIdentity.get(identityKey) ?? [];
      if (pending.length) conflicts.push(`Tiedostossa on useita uusia seuroja nimellä "${club.seura}" ja paikkakunnalla ${club.paikkakunta}.`);
      additionsByIdentity.set(identityKey, [...pending, club.id]);
      next.set(club.id, structuredClone(club));
      summary.added += 1;
      continue;
    }

    if (existing) {
      if (equalClub(existing, club)) summary.unchanged += 1;
      else {
        summary.updated += 1;
        if (!existing.archived && club.archived) summary.archived += 1;
        if (existing.archived && !club.archived) summary.restored += 1;
        next.set(club.id, structuredClone(club));
      }
      continue;
    }
    if (sameNameTown.length > 0) {
      conflicts.push(`"${club.seura}" / ${club.paikkakunta} vastaa nykyistä seuraa mutta sen ID ei täsmää.`);
      continue;
    }
    const pending = additionsByIdentity.get(identityKey) ?? [];
    if (pending.length) conflicts.push(`Tiedostossa on useita uusia seuroja nimellä "${club.seura}" ja paikkakunnalla ${club.paikkakunta}.`);
    additionsByIdentity.set(identityKey, [...pending, club.id]);
    next.set(club.id, structuredClone(club));
    summary.added += 1;
  }
  if (conflicts.length) throw new Error(conflicts.join('\n'));
  return { data: [...next.values()], summary };
}
