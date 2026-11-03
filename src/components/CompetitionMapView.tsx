import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Competition } from '../models/competition';
import type { MunicipalityDataset } from '../models/region';
import { describeCompetitionYears, filterCompetitions, selectedCompetitionYears } from '../services/competitionService';
import { formatCount } from '../services/mapService';
import { normalizeMunicipalityName } from '../services/populationService';
import { useCompetitionData } from '../state/useCompetitions';
import { ChartCard } from './ChartCard';
import { CompetitionFilters } from './CompetitionFilters';

const finlandBounds: L.LatLngTuple[] = [[59.45, 19.1], [70.15, 31.6]];
const heatColors = ['#d9eee2', '#a8d7b6', '#76bd91', '#4b9e70', '#28734d'];
const preferencesKey = 'seurakartta-competition-map';

interface MapPreferences {
  showHeatmap: boolean;
  showBoundaries: boolean;
  showBaseMap: boolean;
  showSummary: boolean;
  showMunicipalityDetails: boolean;
  showTrend: boolean;
}

const defaultPreferences: MapPreferences = {
  showHeatmap: true,
  showBoundaries: true,
  showBaseMap: true,
  showSummary: true,
  showMunicipalityDetails: true,
  showTrend: true,
};

interface MapState extends MapPreferences {
  counts: Map<string, number>;
  records: Competition[];
  onSelect: (name: string) => void;
}

function readPreferences(): MapPreferences {
  try {
    const saved = localStorage.getItem(preferencesKey);
    if (!saved) return defaultPreferences;
    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaultPreferences;
    const values = parsed as Record<string, unknown>;
    return {
      showHeatmap: typeof values.showHeatmap === 'boolean' ? values.showHeatmap : defaultPreferences.showHeatmap,
      showBoundaries: typeof values.showBoundaries === 'boolean' ? values.showBoundaries : defaultPreferences.showBoundaries,
      showBaseMap: typeof values.showBaseMap === 'boolean' ? values.showBaseMap : defaultPreferences.showBaseMap,
      showSummary: typeof values.showSummary === 'boolean' ? values.showSummary : defaultPreferences.showSummary,
      showMunicipalityDetails: typeof values.showMunicipalityDetails === 'boolean' ? values.showMunicipalityDetails : defaultPreferences.showMunicipalityDetails,
      showTrend: typeof values.showTrend === 'boolean' ? values.showTrend : defaultPreferences.showTrend,
    };
  } catch {
    return defaultPreferences;
  }
}

function fillColor(count: number, max: number) {
  if (count === 0) return '#e2e8f0';
  return heatColors[Math.min(heatColors.length - 1, Math.ceil(count / Math.max(1, max) * heatColors.length) - 1)];
}

function popupContent(name: string, records: Competition[]): HTMLElement {
  const root = document.createElement('section');
  root.className = 'competition-map-popup';
  const heading = document.createElement('h3');
  heading.textContent = 'Kuntatiedot';
  const municipality = document.createElement('strong');
  municipality.textContent = name;
  root.append(heading, municipality);

  const years = records.map((record) => record.Vuosi);
  const values: [string, string][] = [
    ['Kilpailuja yhteensä', formatCount(records.length)],
    ['Ensimmäinen kilpailuvuosi rajauksessa', years.length ? String(Math.min(...years)) : 'Ei kilpailuja'],
    ['Viimeisin kilpailuvuosi rajauksessa', years.length ? String(Math.max(...years)) : 'Ei kilpailuja'],
    ['Eri kilpailunimiä', formatCount(new Set(records.map((record) => record['Kilpailun nimi'])).size)],
  ];
  const list = document.createElement('dl');
  for (const [label, value] of values) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value;
    row.append(term, description);
    list.append(row);
  }
  root.append(list);
  const note = document.createElement('p');
  note.textContent = 'Eri kilpailunimet ovat aineiston nimitekstejä, eivät yksilöityjä tapahtumatunnisteita.';
  root.append(note);
  return root;
}

function municipalityStyle(code: string, name: string, state: MapState, max: number): L.PathOptions {
  const count = state.counts.get(normalizeMunicipalityName(name)) ?? 0;
  return {
    color: state.showBoundaries ? '#52635a' : 'transparent',
    weight: state.showBoundaries ? 0.75 : 0,
    opacity: state.showBoundaries ? 0.75 : 0,
    fillColor: state.showHeatmap ? fillColor(count, max) : '#cbd5e1',
    fillOpacity: state.showHeatmap ? 0.82 : 0.05,
    className: `competition-municipality competition-municipality-${code}`,
  };
}

export function CompetitionMapView({ dataset }: { dataset: MunicipalityDataset }) {
  const { index, yearFilter } = useCompetitionData();
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const geographyLayer = useRef<L.GeoJSON | null>(null);
  const tileLayer = useRef<L.TileLayer | null>(null);
  const [preferences, setPreferences] = useState(readPreferences);
  const [preferenceError, setPreferenceError] = useState(false);
  const [municipalityQuery, setMunicipalityQuery] = useState('');
  const [competitionQuery, setCompetitionQuery] = useState('');
  const [selectedMunicipality, setSelectedMunicipality] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(preferencesKey, JSON.stringify(preferences));
      setPreferenceError(false);
    } catch {
      setPreferenceError(true);
    }
  }, [preferences]);

  const selectedYears = useMemo(() => index ? selectedCompetitionYears(index, yearFilter) : [], [index, yearFilter]);
  const records = useMemo(() => {
    if (!index) return [];
    const municipalityNeedle = normalizeMunicipalityName(municipalityQuery);
    const competitionNeedle = normalizeMunicipalityName(competitionQuery);
    return filterCompetitions(index, yearFilter).filter((record) => (
      (!municipalityNeedle || normalizeMunicipalityName(record.Kunta).includes(municipalityNeedle))
      && (!competitionNeedle || normalizeMunicipalityName(record['Kilpailun nimi']).includes(competitionNeedle))
    ));
  }, [competitionQuery, index, municipalityQuery, yearFilter]);
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const record of records) {
      const key = normalizeMunicipalityName(record.Kunta);
      result.set(key, (result.get(key) ?? 0) + 1);
    }
    return result;
  }, [records]);
  const maximum = Math.max(...counts.values(), 1);
  const municipalityNames = useMemo(() => [...new Set(index?.records.map((record) => record.Kunta) ?? [])]
    .sort((a, b) => a.localeCompare(b, 'fi')), [index]);
  const availableNames = useMemo(() => new Set(dataset.municipalities.map((item) => normalizeMunicipalityName(item.name))), [dataset]);
  const unmatched = [...counts].filter(([name]) => !availableNames.has(name));
  const filteredMunicipalities = counts.size;
  const selectedRecords = records.filter((record) => normalizeMunicipalityName(record.Kunta) === normalizeMunicipalityName(selectedMunicipality));
  const yearlyTrend = selectedYears.map((year) => ({
    label: String(year),
    count: selectedRecords.filter((record) => record.Vuosi === year).length,
  }));
  const latestYears = selectedRecords.map((record) => record.Vuosi);

  const currentMapState: MapState = {
    ...preferences,
    counts,
    records,
    onSelect: setSelectedMunicipality,
  };
  const latestMapState = useRef(currentMapState);
  latestMapState.current = currentMapState;

  useEffect(() => {
    if (!element.current) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const instance = L.map(element.current, {
      zoomControl: false,
      scrollWheelZoom: false,
      minZoom: 4,
      maxZoom: 18,
      fadeAnimation: !reduceMotion,
      zoomAnimation: !reduceMotion,
    });
    instance.fitBounds(finlandBounds, { padding: [12, 12] });
    L.control.zoom({ position: 'bottomright' }).addTo(instance);
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    });
    if (latestMapState.current.showBaseMap) tiles.addTo(instance);
    const features: GeoJSON.Feature[] = dataset.municipalities.map((municipality) => ({
      type: 'Feature',
      properties: { code: municipality.code, name: municipality.name },
      geometry: {
        type: 'MultiPolygon',
        coordinates: municipality.geometry.polygons,
      },
    }));
    const geography = L.geoJSON({ type: 'FeatureCollection', features } as GeoJSON.FeatureCollection, {
      style: (feature) => {
        const code = String(feature?.properties?.code ?? '');
        const name = String(feature?.properties?.name ?? '');
        return municipalityStyle(code, name, latestMapState.current, Math.max(...latestMapState.current.counts.values(), 1));
      },
      onEachFeature: (feature, layer) => {
        if (!(layer instanceof L.Path)) return;
        const name = String(feature.properties?.name ?? '');
        layer.bindTooltip(name, { sticky: true });
        layer.bindPopup(() => popupContent(name, latestMapState.current.records.filter(
          (record) => normalizeMunicipalityName(record.Kunta) === normalizeMunicipalityName(name),
        )));
        layer.on('click', () => latestMapState.current.onSelect(name));
        layer.on('add', () => {
          const node = layer.getElement();
          if (!node) return;
          node.setAttribute('tabindex', '0');
          node.setAttribute('role', 'button');
          node.setAttribute('aria-label', `${name}, ${formatCount(latestMapState.current.counts.get(normalizeMunicipalityName(name)) ?? 0)} kilpailua`);
          node.addEventListener('keydown', (event) => {
            const keyEvent = event as KeyboardEvent;
            if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
              keyEvent.preventDefault();
              layer.fire('click');
              layer.openPopup();
            }
          });
        });
      },
    }).addTo(instance);
    map.current = instance;
    tileLayer.current = tiles;
    geographyLayer.current = geography;
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
      tileLayer.current = null;
      geographyLayer.current = null;
    };
  }, [dataset]);

  useEffect(() => {
    geographyLayer.current?.eachLayer((layer) => {
      if (!(layer instanceof L.Path)) return;
      const feature = (layer as L.Path & { feature?: GeoJSON.Feature }).feature;
      const code = String(feature?.properties?.code ?? '');
      const name = String(feature?.properties?.name ?? '');
      layer.setStyle(municipalityStyle(code, name, currentMapState, maximum));
      const node = layer.getElement();
      node?.setAttribute('aria-label', `${name}, ${formatCount(counts.get(normalizeMunicipalityName(name)) ?? 0)} kilpailua`);
      if (layer.isPopupOpen()) layer.getPopup()?.setContent(popupContent(name, records.filter(
        (record) => normalizeMunicipalityName(record.Kunta) === normalizeMunicipalityName(name),
      )));
    });
  }, [counts, maximum, preferences, records]);

  useEffect(() => {
    const instance = map.current;
    const tiles = tileLayer.current;
    if (!instance || !tiles) return;
    if (preferences.showBaseMap) tiles.addTo(instance);
    else tiles.remove();
  }, [preferences.showBaseMap]);

  const restoreDefaults = () => {
    setPreferences(defaultPreferences);
    setMunicipalityQuery('');
    setCompetitionQuery('');
    setSelectedMunicipality('');
    map.current?.fitBounds(finlandBounds, { padding: [12, 12] });
  };

  const setLayerPreference = (key: keyof MapPreferences, value: boolean) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  return (
    <section className="competition-map-section" id="kilpailutoiminta" aria-labelledby="competition-map-title">
      <header className="competition-map-heading">
        <div>
          <p className="eyebrow">KILPAILUTOIMINTA SUOMESSA</p>
          <h2 id="competition-map-title">Missä kilpailuja järjestetään?</h2>
          <p>Värit näyttävät aineistorivien määrän kunnittain. Kukin lähderivi lasketaan kilpailuksi.</p>
        </div>
        <a className="secondary-button" href="#/alueet">Avaa aluesuunnittelu</a>
      </header>
      <CompetitionFilters compact />
      <div className="competition-map-controls">
        <label>Kunta<input type="search" value={municipalityQuery} onChange={(event) => setMunicipalityQuery(event.target.value)} list="competition-municipality-options" placeholder="Hae kuntaa…" /></label>
        <datalist id="competition-municipality-options">{municipalityNames.map((name) => <option key={name} value={name} />)}</datalist>
        <label>Kilpailun nimi<input type="search" value={competitionQuery} onChange={(event) => setCompetitionQuery(event.target.value)} placeholder="Hae kilpailun nimellä…" /></label>
        <p role="status"><strong data-testid="competition-total">{formatCount(records.length)}</strong> kilpailuriviä · {filteredMunicipalities} aktiivista kuntaa · {describeCompetitionYears(yearFilter)}</p>
      </div>
      {index && records.length === 0 && <p className="empty-note" role="status">Valitussa rajauksessa ei ole kilpailuja.</p>}
      <details className="competition-map-layer-control">
        <summary>Karttatasot ja paneelit</summary>
        <fieldset><legend>Karttatasot</legend>
          <label><input type="checkbox" checked={preferences.showHeatmap} onChange={(event) => setLayerPreference('showHeatmap', event.target.checked)} /> Kilpailumäärien väritys</label>
          <label><input type="checkbox" checked={preferences.showBoundaries} onChange={(event) => setLayerPreference('showBoundaries', event.target.checked)} /> Kuntarajat</label>
          <label><input type="checkbox" checked={preferences.showBaseMap} onChange={(event) => setLayerPreference('showBaseMap', event.target.checked)} /> Taustakartta</label>
        </fieldset>
        <fieldset><legend>Paneelit</legend>
          <label><input type="checkbox" checked={preferences.showSummary} onChange={(event) => setLayerPreference('showSummary', event.target.checked)} /> Yhteenveto</label>
          <label><input type="checkbox" checked={preferences.showMunicipalityDetails} onChange={(event) => setLayerPreference('showMunicipalityDetails', event.target.checked)} /> Kuntatiedot</label>
          <label><input type="checkbox" checked={preferences.showTrend} onChange={(event) => setLayerPreference('showTrend', event.target.checked)} /> Kilpailujen kehitys</label>
        </fieldset>
        <button type="button" className="clear-filters" onClick={restoreDefaults}>Palauta oletukset ja näkymä</button>
      </details>
      <div className="competition-map-layout">
        <div className="competition-map-frame">
          <div ref={element} className="competition-map-canvas" role="region" aria-label="Suomen kuntakartta kilpailurivien määrän mukaan. Kunta avaa kuntatiedot." />
          <button type="button" className="map-reset" onClick={() => map.current?.fitBounds(finlandBounds, { padding: [12, 12] })}>Näytä Suomi</button>
          <div className="competition-map-legend" aria-label="Kilpailumäärien karttaselite">
            <strong>Kilpailuja / kunta</strong>
            <span><i style={{ background: '#e2e8f0' }} />0</span>
            {heatColors.map((color, index) => {
              const from = Math.floor(maximum / heatColors.length * index) + 1;
              const to = index === heatColors.length - 1 ? maximum : Math.floor(maximum / heatColors.length * (index + 1));
              return to >= from ? <span key={color}><i style={{ background: color }} />{from === to ? from : `${from}–${to}`}</span> : null;
            })}
          </div>
        </div>
        <aside className="competition-map-side-panel" aria-label="Kilpailutilastot">
          {preferenceError && <p className="data-warning" role="status">Näkymäasetusten tallennus tähän selaimeen ei onnistunut.</p>}
          {preferences.showSummary && <section className="panel competition-summary" aria-label="Yhteenveto">
            <h3>Yhteenveto</h3>
            <dl>
              <div><dt>Kilpailuja yhteensä</dt><dd>{formatCount(records.length)}</dd></div>
              <div><dt>Aktiivisia kuntia</dt><dd>{filteredMunicipalities}</dd></div>
              <div><dt>Ensimmäinen kilpailuvuosi</dt><dd>{records.length ? Math.min(...records.map((record) => record.Vuosi)) : '–'}</dd></div>
              <div><dt>Viimeisin kilpailuvuosi</dt><dd>{records.length ? Math.max(...records.map((record) => record.Vuosi)) : '–'}</dd></div>
            </dl>
            <p className="hint">Luvut koskevat valittuja vuosia ja hakuja. Ne kuvaavat tiedoston rivejä, eivät vahvistettua tapahtumamäärää.</p>
          </section>}
          {preferences.showMunicipalityDetails && <section className="panel competition-municipality-details" aria-live="polite">
            <h3>Kuntatiedot</h3>
            {selectedMunicipality
              ? <>
                <strong>{selectedMunicipality}</strong>
                <dl>
                  <div><dt>Kilpailuja yhteensä</dt><dd>{formatCount(selectedRecords.length)}</dd></div>
                  <div><dt>Ensimmäinen kilpailuvuosi rajauksessa</dt><dd>{latestYears.length ? Math.min(...latestYears) : '–'}</dd></div>
                  <div><dt>Viimeisin kilpailuvuosi rajauksessa</dt><dd>{latestYears.length ? Math.max(...latestYears) : '–'}</dd></div>
                  <div><dt>Eri kilpailunimiä</dt><dd>{new Set(selectedRecords.map((record) => record['Kilpailun nimi'])).size}</dd></div>
                </dl>
                <p className="hint">Nimien määrä ei takaa yksilöllisten tapahtumien määrää; aineistossa ei ole tapahtumatunnistetta.</p>
              </>
              : <p className="hint">Valitse kunta kartalta nähdäksesi sen kilpailutiedot.</p>}
          </section>}
          {preferences.showTrend && <section className="panel competition-trend">
            <h3>Kilpailujen kehitys</h3>
            {selectedMunicipality
              ? <ChartCard title={selectedMunicipality} description="Kilpailurivit valittuina vuosina" rows={yearlyTrend} color="var(--accent-strong)" />
              : <p className="hint">Valitse kunta kartalta nähdäksesi vuosittaisen kilpailumäärän.</p>}
          </section>}
          {unmatched.length > 0 && <p className="data-warning" role="status">
            Karttaraja puuttuu {unmatched.length} aktiiviselta kunnalta: {[...unmatched].map(([name, count]) => `${name} (${count})`).join(', ')}. Kunta sisältyy lukuihin ja hakutuloksiin.
          </p>}
        </aside>
      </div>
    </section>
  );
}
