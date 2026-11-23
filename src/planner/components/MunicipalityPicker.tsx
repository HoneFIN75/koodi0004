import { useMemo, useState } from 'react';
import type { MunicipalityDataset, Region } from '../../models/region';
import { normalizeName, type MunicipalityAggregate } from '../../services/regionAnalytics';
import { matchesPopulation, summarizePopulation, type PopulationFilters as Filters } from '../../services/populationService';
import { PopulationFilters } from '../../components/PopulationFilters';
import { formatCount } from '../../services/mapService';

interface MunicipalityPickerProps {
  region: Region;
  dataset: MunicipalityDataset;
  aggregates: Map<string, MunicipalityAggregate>;
  membership: Map<string, Region[]>;
  onChange: (codes: string[], mode: 'add' | 'remove' | 'toggle', label: string) => void;
}

export function MunicipalityPicker({ region, dataset, aggregates, membership, onChange }: MunicipalityPickerProps) {
  const [query, setQuery] = useState('');
  const [province, setProvince] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const [populationFilters, setPopulationFilters] = useState<Filters>({});
  const selected = useMemo(() => new Set(region.municipalityCodes), [region.municipalityCodes]);
  const provinces = useMemo(() => [...new Set(dataset.municipalities.map((item) => item.province).filter((item): item is string => !!item))].sort((a, b) => a.localeCompare(b, 'fi')), [dataset]);
  const visible = useMemo(() => {
    const needle = normalizeName(query);
    return dataset.municipalities.filter((item) => (
      (!needle || normalizeName(item.name).includes(needle) || normalizeName(item.nameSv ?? '').includes(needle))
      && (!province || item.province === province)
      && (!onlySelected || selected.has(item.code))
      && matchesPopulation(item.population, populationFilters)
    ));
  }, [dataset, query, province, onlySelected, selected, populationFilters]);
  const visibleCodes = visible.map((item) => item.code);

  return (
    <fieldset className="municipality-picker">
      <legend>Kunnat <span className="pill">{selected.size} valittu</span></legend>
      <p className="hint">Napsauta kuntia kartalla tai valitse ne luettelosta. Kunta voi kuulua useaan alueeseen.</p>
      <p className="hint">Valittujen kuntien väestö 2025: {formatCount(summarizePopulation(dataset.municipalities.filter((item) => selected.has(item.code))).total)}</p>
      <PopulationFilters filters={populationFilters} onChange={setPopulationFilters} />
      <div className="picker-controls">
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hae kuntaa…" aria-label="Hae kuntaa nimellä" />
        <select value={province} onChange={(event) => setProvince(event.target.value)} aria-label="Rajaa maakunnan mukaan">
          <option value="">Kaikki maakunnat</option>
          {provinces.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      <div className="picker-bulk">
        <label className="checkbox"><input type="checkbox" checked={onlySelected} onChange={(event) => setOnlySelected(event.target.checked)} /> Vain valitut</label>
        <button type="button" className="text-button" disabled={visibleCodes.every((code) => selected.has(code))} onClick={() => onChange(visibleCodes, 'add', `Lisätty ${visibleCodes.length} kuntaa`)}>Lisää näytetyt ({visibleCodes.length})</button>
        <button type="button" className="text-button" disabled={!visibleCodes.some((code) => selected.has(code))} onClick={() => onChange(visibleCodes, 'remove', `Poistettu ${visibleCodes.length} kuntaa`)}>Poista näytetyt</button>
      </div>
      <ul className="picker-list" aria-label="Kuntaluettelo">
        {visible.map((item) => {
          const others = (membership.get(item.code) ?? []).filter((other) => other.id !== region.id);
          const aggregate = aggregates.get(item.code);
          return (
            <li key={item.code}>
              <label className="checkbox">
                <input type="checkbox" checked={selected.has(item.code)} onChange={() => onChange([item.code], 'toggle', `${selected.has(item.code) ? 'Poistettu' : 'Lisätty'} kunta ${item.name}`)} />
                <span className="picker-name">{item.name}<small>{item.province ?? ''} · {formatCount(item.population)} as.{others.length ? ` · myös ${others.map((other) => other.shortName).join(', ')}` : ''}</small></span>
                <span className="picker-count" title="Seuroja">{aggregate?.clubs.length ? `${aggregate.clubs.length} seuraa` : ''}</span>
              </label>
            </li>
          );
        })}
        {visible.length === 0 && <li className="empty-text">Ei hakua vastaavia kuntia.</li>}
      </ul>
    </fieldset>
  );
}
