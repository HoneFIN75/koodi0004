import type { PlannerDocument, Region, RegionDraft, Scenario } from '../models/region';
import { DEFAULT_OPACITY, REGION_COLORS, nextColor, normalizeHex } from './regionColors.ts';

export const DOCUMENT_FORMAT = 'koodi0004-region-planner';

export function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const now = () => new Date().toISOString();
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value.slice(0, 2000) : fallback;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function createScenario(name: string, regions: Region[] = []): Scenario {
  const timestamp = now();
  return { id: createId(), name, description: '', regions, createdAt: timestamp, updatedAt: timestamp };
}

export function createDocument(): PlannerDocument {
  const scenario = createScenario('Nykyrakenne');
  return { version: 1, activeScenarioId: scenario.id, scenarios: [scenario] };
}

export function createRegion(existing: Region[], draft: RegionDraft = {}): Region {
  const timestamp = now();
  const number = draft.number ?? existing.reduce((max, region) => Math.max(max, region.number), 0) + 1;
  return {
    id: createId(),
    number,
    name: draft.name?.trim() || `Alue ${number}`,
    shortName: draft.shortName?.trim() || `A${number}`,
    description: draft.description ?? '',
    color: normalizeHex(draft.color ?? '') ?? nextColor(existing.map((region) => region.color)),
    opacity: clamp(draft.opacity ?? DEFAULT_OPACITY, 0, 1),
    enabled: draft.enabled ?? true,
    visible: draft.visible ?? true,
    municipalityCodes: [...new Set(draft.municipalityCodes ?? [])],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function activeScenario(document: PlannerDocument): Scenario {
  return document.scenarios.find((scenario) => scenario.id === document.activeScenarioId) ?? document.scenarios[0];
}

function mapActiveScenario(document: PlannerDocument, update: (scenario: Scenario) => Scenario): PlannerDocument {
  const active = activeScenario(document);
  return { ...document, scenarios: document.scenarios.map((scenario) => scenario.id === active.id ? { ...update(scenario), updatedAt: now() } : scenario) };
}

function mapRegion(document: PlannerDocument, regionId: string, update: (region: Region) => Region): PlannerDocument {
  return mapActiveScenario(document, (scenario) => ({
    ...scenario,
    regions: scenario.regions.map((region) => region.id === regionId ? { ...update(region), updatedAt: now() } : region),
  }));
}

export const documentOps = {
  addRegion(document: PlannerDocument, draft: RegionDraft = {}): { document: PlannerDocument; region: Region } {
    const region = createRegion(activeScenario(document).regions, draft);
    return { document: mapActiveScenario(document, (scenario) => ({ ...scenario, regions: [...scenario.regions, region] })), region };
  },
  updateRegion(document: PlannerDocument, regionId: string, changes: RegionDraft): PlannerDocument {
    return mapRegion(document, regionId, (region) => ({
      ...region,
      ...changes,
      color: changes.color === undefined ? region.color : normalizeHex(changes.color) ?? region.color,
      opacity: changes.opacity === undefined ? region.opacity : clamp(changes.opacity, 0, 1),
      municipalityCodes: changes.municipalityCodes === undefined ? region.municipalityCodes : [...new Set(changes.municipalityCodes)],
    }));
  },
  duplicateRegion(document: PlannerDocument, regionId: string): { document: PlannerDocument; region: Region | null } {
    const regions = activeScenario(document).regions;
    const source = regions.find((region) => region.id === regionId);
    if (!source) return { document, region: null };
    const region = createRegion(regions, { ...source, number: undefined, name: `${source.name} (kopio)`, shortName: source.shortName, color: nextColor(regions.map((item) => item.color)) });
    return { document: mapActiveScenario(document, (scenario) => ({ ...scenario, regions: [...scenario.regions, region] })), region };
  },
  deleteRegion(document: PlannerDocument, regionId: string): PlannerDocument {
    return mapActiveScenario(document, (scenario) => ({ ...scenario, regions: scenario.regions.filter((region) => region.id !== regionId) }));
  },
  setMunicipalities(document: PlannerDocument, regionId: string, codes: string[], mode: 'add' | 'remove' | 'toggle' | 'replace'): PlannerDocument {
    return mapRegion(document, regionId, (region) => {
      const current = new Set(region.municipalityCodes);
      if (mode === 'replace') return { ...region, municipalityCodes: [...new Set(codes)] };
      for (const code of codes) {
        if (mode === 'add' || (mode === 'toggle' && !current.has(code))) current.add(code);
        else current.delete(code);
      }
      return { ...region, municipalityCodes: [...current] };
    });
  },
  addScenario(document: PlannerDocument, name: string): PlannerDocument {
    const scenario = createScenario(name.trim() || `Skenaario ${document.scenarios.length + 1}`);
    return { ...document, scenarios: [...document.scenarios, scenario], activeScenarioId: scenario.id };
  },
  renameScenario(document: PlannerDocument, scenarioId: string, name: string): PlannerDocument {
    if (!name.trim()) return document;
    return { ...document, scenarios: document.scenarios.map((scenario) => scenario.id === scenarioId ? { ...scenario, name: name.trim(), updatedAt: now() } : scenario) };
  },
  duplicateScenario(document: PlannerDocument, scenarioId: string): PlannerDocument {
    const source = document.scenarios.find((scenario) => scenario.id === scenarioId);
    if (!source) return document;
    const copy = createScenario(`${source.name} (kopio)`, source.regions.map((region) => ({ ...region, id: createId(), municipalityCodes: [...region.municipalityCodes] })));
    copy.description = source.description;
    return { ...document, scenarios: [...document.scenarios, copy], activeScenarioId: copy.id };
  },
  deleteScenario(document: PlannerDocument, scenarioId: string): PlannerDocument {
    if (document.scenarios.length <= 1) return document;
    const scenarios = document.scenarios.filter((scenario) => scenario.id !== scenarioId);
    return { ...document, scenarios, activeScenarioId: document.activeScenarioId === scenarioId ? scenarios[0].id : document.activeScenarioId };
  },
  setActiveScenario(document: PlannerDocument, scenarioId: string): PlannerDocument {
    return document.scenarios.some((scenario) => scenario.id === scenarioId) ? { ...document, activeScenarioId: scenarioId } : document;
  },
  replaceRegions(document: PlannerDocument, regions: Region[]): PlannerDocument {
    return mapActiveScenario(document, (scenario) => ({ ...scenario, regions }));
  },
  appendScenarios(document: PlannerDocument, scenarios: Scenario[]): PlannerDocument {
    if (scenarios.length === 0) return document;
    return { ...document, scenarios: [...document.scenarios, ...scenarios], activeScenarioId: scenarios[0].id };
  },
};

export function normalizeRegion(value: unknown, index: number, existing: Region[]): Region | null {
  if (!isRecord(value)) return null;
  const codes = Array.isArray(value.municipalityCodes) ? value.municipalityCodes : Array.isArray(value.municipalities) ? value.municipalities : [];
  const municipalityCodes = codes.map((code) => isRecord(code) ? code.code : code)
    .filter((code): code is string | number => typeof code === 'string' || typeof code === 'number')
    .map((code) => typeof code === 'number' ? String(code).padStart(3, '0') : code.trim()).filter(Boolean);
  const number = typeof value.number === 'number' && Number.isFinite(value.number) ? Math.round(value.number) : index + 1;
  const opacity = typeof value.opacity === 'number' && Number.isFinite(value.opacity) ? (value.opacity > 1 ? value.opacity / 100 : value.opacity) : DEFAULT_OPACITY;
  const region = createRegion(existing, {
    number,
    name: text(value.name, `Alue ${number}`),
    shortName: text(value.shortName, ''),
    description: text(value.description),
    color: normalizeHex(text(value.color)) ?? REGION_COLORS[index % REGION_COLORS.length],
    opacity,
    enabled: value.enabled !== false,
    visible: value.visible !== false,
    municipalityCodes,
  });
  if (typeof value.id === 'string' && value.id) region.id = value.id;
  if (typeof value.createdAt === 'string') region.createdAt = value.createdAt;
  if (typeof value.updatedAt === 'string') region.updatedAt = value.updatedAt;
  return region;
}

export function normalizeScenario(value: unknown, index: number): Scenario | null {
  if (!isRecord(value)) return null;
  const regions: Region[] = [];
  (Array.isArray(value.regions) ? value.regions : []).forEach((item, regionIndex) => {
    const region = normalizeRegion(item, regionIndex, regions);
    if (region && !regions.some((other) => other.id === region.id)) regions.push(region);
  });
  const scenario = createScenario(text(value.name, `Skenaario ${index + 1}`) || `Skenaario ${index + 1}`, regions);
  scenario.description = text(value.description);
  if (typeof value.id === 'string' && value.id) scenario.id = value.id;
  if (typeof value.createdAt === 'string') scenario.createdAt = value.createdAt;
  if (typeof value.updatedAt === 'string') scenario.updatedAt = value.updatedAt;
  return scenario;
}

/** Accepts stored documents and exported files; returns null when nothing usable is found. */
export function normalizeDocument(value: unknown): PlannerDocument | null {
  if (!isRecord(value)) return null;
  const source = isRecord(value.document) ? value.document : value;
  const rawScenarios = Array.isArray(source.scenarios) ? source.scenarios : isRecord(source.scenario) ? [source.scenario] : null;
  if (!rawScenarios) return null;
  const scenarios: Scenario[] = [];
  rawScenarios.forEach((item, index) => {
    const scenario = normalizeScenario(item, index);
    if (scenario && !scenarios.some((other) => other.id === scenario.id)) scenarios.push(scenario);
  });
  if (scenarios.length === 0) return null;
  const activeScenarioId = typeof source.activeScenarioId === 'string' && scenarios.some((scenario) => scenario.id === source.activeScenarioId) ? source.activeScenarioId : scenarios[0].id;
  return { version: 1, activeScenarioId, scenarios };
}

export interface ImportResult {
  kind: 'document' | 'regions';
  scenarios: Scenario[];
  regions: Region[];
}

/** Imported items get fresh ids so they never collide with the current workspace. */
export function parseImport(value: unknown): ImportResult {
  const document = normalizeDocument(value);
  if (document) {
    return {
      kind: 'document', regions: [],
      scenarios: document.scenarios.map((scenario) => ({ ...scenario, id: createId(), regions: scenario.regions.map((region) => ({ ...region, id: createId() })) })),
    };
  }
  const rawRegions = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.regions) ? value.regions : null;
  if (rawRegions) {
    const regions: Region[] = [];
    rawRegions.forEach((item, index) => {
      const region = normalizeRegion(item, index, regions);
      if (region) regions.push({ ...region, id: createId() });
    });
    if (regions.length > 0) return { kind: 'regions', scenarios: [], regions };
  }
  throw new Error('Tiedostosta ei löytynyt alue- tai skenaariomäärityksiä.');
}
