import { useEffect, useState } from 'react';
import type { ProvinceOverlaySettings } from '../models/province.ts';
import { readProvinceSettings, saveProvinceSettings } from '../services/provinceSettings.ts';

export function useProvinceSettings(): [ProvinceOverlaySettings, (next: ProvinceOverlaySettings) => void] {
  const [settings, setSettings] = useState(readProvinceSettings);
  useEffect(() => { saveProvinceSettings(settings); }, [settings]);
  return [settings, setSettings];
}
