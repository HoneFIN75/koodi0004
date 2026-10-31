import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { MunicipalityDataset, Region, RegionDraft } from '../../models/region';
import type { MunicipalityAggregate } from '../../services/regionAnalytics';
import { REGION_COLORS, normalizeHex } from '../../services/regionColors';
import { MunicipalityPicker } from './MunicipalityPicker';

interface RegionEditorProps {
  region: Region;
  dataset: MunicipalityDataset;
  aggregates: Map<string, MunicipalityAggregate>;
  membership: Map<string, Region[]>;
  onChange: (changes: RegionDraft, label: string, field: string) => void;
  onMunicipalities: (codes: string[], mode: 'add' | 'remove' | 'toggle', label: string) => void;
  onClose: () => void;
}

export function RegionEditor({ region, dataset, aggregates, membership, onChange, onMunicipalities, onClose }: RegionEditorProps) {
  const [hex, setHex] = useState(region.color);
  useEffect(() => setHex(region.color), [region.color]);
  const hexValid = normalizeHex(hex) !== null;
  const prefix = `region-${region.id}`;

  return (
    <section className="planner-card region-editor" aria-labelledby={`${prefix}-title`}>
      <header className="card-header">
        <div><h2 id={`${prefix}-title`}>Muokkaa aluetta</h2><p>Muutokset tallentuvat automaattisesti.</p></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Sulje muokkaus"><X size={17} /></button>
      </header>
      <div className="form-grid">
        <label className="field narrow">Numero
          <input type="number" min={0} value={region.number} onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) onChange({ number: Math.round(value) }, 'Aluenumeron muutos', 'number'); }} />
        </label>
        <label className="field narrow">Lyhenne
          <input value={region.shortName} maxLength={12} onChange={(event) => onChange({ shortName: event.target.value }, 'Lyhenteen muutos', 'shortName')} />
        </label>
        <label className="field wide">Nimi
          <input value={region.name} maxLength={120} onChange={(event) => onChange({ name: event.target.value }, 'Nimen muutos', 'name')} />
        </label>
        <label className="field wide">Kuvaus
          <textarea rows={3} value={region.description} maxLength={2000} onChange={(event) => onChange({ description: event.target.value }, 'Kuvauksen muutos', 'description')} />
        </label>
      </div>
      <fieldset className="color-field">
        <legend>Väri</legend>
        <div className="swatches" role="radiogroup" aria-label="Valmiit värit">
          {REGION_COLORS.map((color) => (
            <button key={color} type="button" role="radio" aria-checked={region.color === color} aria-label={`Väri ${color}`} className="swatch" style={{ background: color }} onClick={() => onChange({ color }, 'Värin muutos', 'color')}>
              {region.color === color && <Check size={14} color="#fff" />}
            </button>
          ))}
        </div>
        <div className="color-inputs">
          <label className="field">HEX
            <input value={hex} aria-invalid={!hexValid} onChange={(event) => { setHex(event.target.value); const normalized = normalizeHex(event.target.value); if (normalized) onChange({ color: normalized }, 'Värin muutos', 'color'); }} />
          </label>
          <label className="field">Värivalitsin
            <input type="color" value={region.color.toLowerCase()} onChange={(event) => onChange({ color: event.target.value }, 'Värin muutos', 'color')} />
          </label>
        </div>
        {!hexValid && <p className="field-error" role="alert">Anna väri muodossa #RRGGBB.</p>}
      </fieldset>
      <label className="field opacity-field">
        <span>Läpinäkyvyys (täyttö) <strong>{Math.round(region.opacity * 100)} %</strong></span>
        <input type="range" min={0} max={100} value={Math.round(region.opacity * 100)} onChange={(event) => onChange({ opacity: Number(event.target.value) / 100 }, 'Läpinäkyvyyden muutos', 'opacity')} aria-valuetext={`${Math.round(region.opacity * 100)} prosenttia`} />
      </label>
      <div className="toggle-row">
        <label className="checkbox"><input type="checkbox" checked={region.enabled} onChange={(event) => onChange({ enabled: event.target.checked }, event.target.checked ? 'Alue käyttöön' : 'Alue pois käytöstä', 'enabled')} /> Käytössä</label>
        <label className="checkbox"><input type="checkbox" checked={region.visible} onChange={(event) => onChange({ visible: event.target.checked }, event.target.checked ? 'Alue näkyviin' : 'Alue piiloon', 'visible')} /> Näkyy kartalla</label>
      </div>
      <MunicipalityPicker region={region} dataset={dataset} aggregates={aggregates} membership={membership} onChange={onMunicipalities} />
      <button type="button" className="primary-button full" onClick={onClose}>Valmis</button>
    </section>
  );
}
