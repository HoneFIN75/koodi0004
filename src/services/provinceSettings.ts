import type { ProvinceOverlaySettings } from '../models/province.ts';

export const PROVINCE_SETTINGS_KEY = 'seurakartta-province-overlay-v1';
export const DEFAULT_PROVINCE_SETTINGS: ProvinceOverlaySettings = {
  showRegions: true,
  regionOpacity: 0.35,
  showRegionBorders: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseProvinceSettings(value: unknown): ProvinceOverlaySettings {
  if (!isRecord(value)) return DEFAULT_PROVINCE_SETTINGS;
  return {
    showRegions: typeof value.showRegions === 'boolean' ? value.showRegions : DEFAULT_PROVINCE_SETTINGS.showRegions,
    regionOpacity: typeof value.regionOpacity === 'number' && Number.isFinite(value.regionOpacity)
      ? Math.min(1, Math.max(0, value.regionOpacity)) : DEFAULT_PROVINCE_SETTINGS.regionOpacity,
    showRegionBorders: typeof value.showRegionBorders === 'boolean' ? value.showRegionBorders : DEFAULT_PROVINCE_SETTINGS.showRegionBorders,
  };
}

export function readProvinceSettings(): ProvinceOverlaySettings {
  try {
    const stored = localStorage.getItem(PROVINCE_SETTINGS_KEY);
    return stored ? parseProvinceSettings(JSON.parse(stored) as unknown) : DEFAULT_PROVINCE_SETTINGS;
  } catch {
    return DEFAULT_PROVINCE_SETTINGS;
  }
}

export function saveProvinceSettings(settings: ProvinceOverlaySettings): void {
  try {
    localStorage.setItem(PROVINCE_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Keep the in-memory settings usable when browser storage is unavailable.
  }
}
