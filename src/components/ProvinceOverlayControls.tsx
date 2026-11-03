import { useState } from 'react';
import type { ProvinceOverlaySettings } from '../models/province.ts';
import type { ProvinceDataset } from '../models/province.ts';

export function ProvinceOverlayControls({ settings, onChange, provinces, defaultOpen = true, choroplethActive = false }: {
  settings: ProvinceOverlaySettings;
  onChange: (settings: ProvinceOverlaySettings) => void;
  provinces: ProvinceDataset | null;
  defaultOpen?: boolean;
  choroplethActive?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details className="province-overlay-controls" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Maakuntataso</summary>
      <label><input type="checkbox" checked={settings.showRegions} disabled={choroplethActive} onChange={(event) => onChange({ ...settings, showRegions: event.target.checked })} /> Näytä maakunnat</label>
      <label><input type="checkbox" checked={settings.showRegionBorders} disabled={choroplethActive} onChange={(event) => onChange({ ...settings, showRegionBorders: event.target.checked })} /> Näytä maakuntarajat</label>
      {choroplethActive && <p className="hint">Kilpailumäärien väritys on käytössä; maakuntatäytöt ja -rajat on piilotettu.</p>}
      <label className="province-opacity"><span>Täytön peittävyys <strong>{Math.round(settings.regionOpacity * 100)} %</strong></span>
        <input type="range" min={0} max={100} value={Math.round(settings.regionOpacity * 100)} aria-label="Maakuntatason peittävyys"
          onChange={(event) => onChange({ ...settings, regionOpacity: Number(event.target.value) / 100 })} />
      </label>
      {provinces && <details className="province-color-key">
        <summary>Maakuntien värit</summary>
        <div>{provinces.regions.map((province) => <span key={province.id}><i style={{ background: province.color }} />{province.name}</span>)}</div>
      </details>}
    </details>
  );
}
