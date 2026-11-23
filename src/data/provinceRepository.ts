import type { ProvinceDataset, ProvinceDefinition } from '../models/province.ts';

export const REGIONS_URL = './jsondb/regions.json';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isColor = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);

export function parseProvinceDataset(value: unknown): ProvinceDataset {
  if (!isRecord(value) || !Array.isArray(value.regions)) throw new Error('Maakuntatietojen rakenne on virheellinen.');
  const metadata = isRecord(value.metadata) ? value.metadata : {};
  const version = metadata.version;
  if (!Number.isSafeInteger(version) || (version as number) < 1) throw new Error('Maakuntatietojen versio puuttuu tai on virheellinen.');
  const ids = new Set<string>();
  const provinceKeys = new Set<string>();
  const colors = new Set<string>();
  const regions: ProvinceDefinition[] = value.regions.map((item, index) => {
    if (!isRecord(item) || !isText(item.id) || !isText(item.name) || !isText(item.municipalityProvince) || !isColor(item.color)) {
      throw new Error(`Maakuntatietojen rivi ${index + 1} on virheellinen.`);
    }
    if (ids.has(item.id) || provinceKeys.has(item.municipalityProvince) || colors.has(item.color.toUpperCase())) {
      throw new Error(`Maakuntatunnisteen, kuntakytkennän tai värin on oltava yksilöllinen (rivi ${index + 1}).`);
    }
    ids.add(item.id);
    provinceKeys.add(item.municipalityProvince);
    colors.add(item.color.toUpperCase());
    const metadataFields: ProvinceDefinition['metadata'] = {};
    if (isRecord(item.metadata)) {
      for (const [key, entry] of Object.entries(item.metadata)) {
        if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') metadataFields[key] = entry;
      }
    }
    return {
      id: item.id, name: item.name, municipalityProvince: item.municipalityProvince, color: item.color,
      ...(Object.keys(metadataFields).length > 0 && { metadata: metadataFields }),
    };
  });
  if (regions.length === 0) throw new Error('Maakuntatiedoissa ei ole maakuntia.');
  return {
    version: version as number,
    source: isText(metadata.source) ? metadata.source : null,
    regions,
    byId: new Map(regions.map((region) => [region.id, region])),
  };
}

let cached: Promise<ProvinceDataset> | null = null;

export const provinceRepository = {
  getProvinces(fetcher: typeof fetch = fetch): Promise<ProvinceDataset> {
    cached ??= fetcher(REGIONS_URL, { cache: 'no-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`Maakuntatietoja ei voitu ladata (HTTP ${response.status}).`);
        return response.json();
      })
      .then(parseProvinceDataset)
      .catch((error: unknown) => { cached = null; throw error; });
    return cached;
  },
};
