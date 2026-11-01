import type { ProvinceOverlaySettings } from '../models/province.ts';
import type { ProvinceDataset } from '../models/province.ts';

export function ProvinceOverlayControls({ settings, onChange, provinces }: {
  settings: ProvinceOverlaySettings;
  onChange: (settings: ProvinceOverlaySettings) => void;
  provinces: ProvinceDataset | null;
}) {
  return (
    <fieldset className="province-overlay-controls">
      <legend>Maakuntataso</legend>
      <label><input type="checkbox" checked={settings.showRegions} onChange={(event) => onChange({ ...settings, showRegions: event.target.checked })} /> Näytä maakunnat</label>
      <label><input type="checkbox" checked={settings.showRegionBorders} onChange={(event) => onChange({ ...settings, showRegionBorders: event.target.checked })} /> Näytä maakuntarajat</label>
      <label className="province-opacity"><span>Täytön peittävyys <strong>{Math.round(settings.regionOpacity * 100)} %</strong></span>
        <input type="range" min={0} max={100} value={Math.round(settings.regionOpacity * 100)} aria-label="Maakuntatason peittävyys"
          onChange={(event) => onChange({ ...settings, regionOpacity: Number(event.target.value) / 100 })} />
      </label>
      {provinces && <details className="province-color-key">
        <summary>Maakuntien värit</summary>
        <div>{provinces.regions.map((province) => <span key={province.id}><i style={{ background: province.color }} />{province.name}</span>)}</div>
      </details>}
    </fieldset>
  );
}
