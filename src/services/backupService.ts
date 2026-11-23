import type { PlannerDocument, Region, Snapshot } from '../models/region';
import { createId } from './plannerDocument.ts';

export const BACKUP_LIMIT = 10;
export const AUTO_BACKUP_INTERVAL_MS = 5 * 60 * 1000;

const fingerprint = (document: PlannerDocument) => JSON.stringify(document.scenarios);

export function addSnapshot(backups: Snapshot[], document: PlannerDocument, reason: string, at = new Date()): Snapshot[] {
  const latest = backups[0];
  if (latest && fingerprint(latest.document) === fingerprint(document)) return backups;
  return [{ id: createId(), createdAt: at.toISOString(), reason, document: structuredClone(document) }, ...backups].slice(0, BACKUP_LIMIT);
}

export function shouldAutoBackup(backups: Snapshot[], at = Date.now()): boolean {
  const latest = backups[0];
  return !latest || at - Date.parse(latest.createdAt) >= AUTO_BACKUP_INTERVAL_MS;
}

export interface RegionChange {
  scenario: string;
  region: string;
  changes: string[];
}

export interface SnapshotComparison {
  addedScenarios: string[];
  removedScenarios: string[];
  addedRegions: { scenario: string; region: string }[];
  removedRegions: { scenario: string; region: string }[];
  changedRegions: RegionChange[];
}

function describeRegionChanges(before: Region, after: Region): string[] {
  const changes: string[] = [];
  const fields: [keyof Region, string][] = [['number', 'numero'], ['name', 'nimi'], ['shortName', 'lyhenne'], ['description', 'kuvaus'], ['color', 'väri'], ['opacity', 'läpinäkyvyys'], ['enabled', 'käytössä'], ['visible', 'näkyvyys']];
  for (const [field, label] of fields) if (before[field] !== after[field]) changes.push(label);
  const beforeCodes = new Set(before.municipalityCodes);
  const afterCodes = new Set(after.municipalityCodes);
  const added = [...afterCodes].filter((code) => !beforeCodes.has(code)).length;
  const removed = [...beforeCodes].filter((code) => !afterCodes.has(code)).length;
  if (added) changes.push(`+${added} kuntaa`);
  if (removed) changes.push(`−${removed} kuntaa`);
  return changes;
}

/** Scenarios and regions are matched by id, so renamed items are reported as changes rather than add/remove pairs. */
export function compareDocuments(before: PlannerDocument, after: PlannerDocument): SnapshotComparison {
  const result: SnapshotComparison = { addedScenarios: [], removedScenarios: [], addedRegions: [], removedRegions: [], changedRegions: [] };
  const beforeScenarios = new Map(before.scenarios.map((scenario) => [scenario.id, scenario]));
  const afterIds = new Set(after.scenarios.map((scenario) => scenario.id));
  for (const scenario of before.scenarios) if (!afterIds.has(scenario.id)) result.removedScenarios.push(scenario.name);
  for (const scenario of after.scenarios) {
    const previous = beforeScenarios.get(scenario.id);
    if (!previous) { result.addedScenarios.push(scenario.name); continue; }
    const previousRegions = new Map(previous.regions.map((region) => [region.id, region]));
    const currentIds = new Set(scenario.regions.map((region) => region.id));
    for (const region of previous.regions) if (!currentIds.has(region.id)) result.removedRegions.push({ scenario: scenario.name, region: region.name });
    for (const region of scenario.regions) {
      const old = previousRegions.get(region.id);
      if (!old) { result.addedRegions.push({ scenario: scenario.name, region: region.name }); continue; }
      const changes = describeRegionChanges(old, region);
      if (changes.length) result.changedRegions.push({ scenario: scenario.name, region: region.name, changes });
    }
  }
  return result;
}
