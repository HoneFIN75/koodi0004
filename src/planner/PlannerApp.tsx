import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, Moon, Redo2, Sun, Undo2 } from 'lucide-react';
import { clubRepository } from '../data/clubRepository';
import { municipalityRepository } from '../data/municipalityRepository';
import type { Database } from '../models/club';
import type { MunicipalityDataset, Region, RegionDraft, Snapshot } from '../models/region';
import { exportCsv, exportFileName, exportJson, exportXlsx, type ExportContext } from '../services/exportService';
import { activeScenario, documentOps, type ImportResult } from '../services/plannerDocument';
import { aggregateByMunicipality, analyzeScenario, assignClubs, emptyFilters, explainCoverage, filterPlacements, normalizeName, type PlannerFilters as Filters } from '../services/regionAnalytics';
import { validateScenario } from '../services/validationService';
import { plannerStore } from '../state/plannerStore';
import { usePlanner } from '../state/usePlanner';
import { BackupManager } from './components/BackupManager';
import { ComparisonView } from './components/ComparisonView';
import { DashboardView } from './components/DashboardView';
import { DataManager } from './components/DataManager';
import { MunicipalityCard } from './components/MunicipalityCard';
import { PlannerFilters } from './components/PlannerFilters';
import { RegionDetail } from './components/RegionDetail';
import { RegionEditor } from './components/RegionEditor';
import { RegionList } from './components/RegionList';
import { RegionMap } from './components/RegionMap';
import { ScenarioManager } from './components/ScenarioManager';
import { UnassignedView } from './components/UnassignedView';
import { ColorDot, SaveIndicator, WarningList } from './components/ui';
import './planner.css';

type View = 'map' | 'dashboard' | 'compare' | 'unassigned' | 'scenarios' | 'backups' | 'data';
const VIEWS: { id: View; label: string }[] = [
  { id: 'map', label: 'Kartta' }, { id: 'dashboard', label: 'Kojelauta' }, { id: 'compare', label: 'Vertailu' },
  { id: 'unassigned', label: 'Kohdistamattomat' }, { id: 'scenarios', label: 'Skenaariot' }, { id: 'backups', label: 'Varmuuskopiot' }, { id: 'data', label: 'Tuonti ja vienti' },
];
const THEME_KEY = 'seurakartta-theme';

function download(content: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PlannerApp() {
  const [clubs, setClubs] = useState<Database | null>(null);
  const [dataset, setDataset] = useState<MunicipalityDataset | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<View>('map');
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [selectedMunicipality, setSelectedMunicipality] = useState<string | null>(null);
  const [highlightUnassigned, setHighlightUnassigned] = useState(false);
  const [showClubs, setShowClubs] = useState(true);
  const [showBaseMap, setShowBaseMap] = useState(true);
  const [dark, setDark] = useState(() => { try { return localStorage.getItem(THEME_KEY) !== 'light'; } catch { return true; } });
  const [writeKey, setWriteKey] = useState('');
  const [writeActionError, setWriteActionError] = useState('');

  const ready = usePlanner((state) => state.ready);
  const loadError = usePlanner((state) => state.loadError);
  const remoteMode = usePlanner((state) => state.remoteMode);
  const migrationAvailable = usePlanner((state) => state.migrationAvailable);
  const writeAuthRequired = usePlanner((state) => state.writeAuthRequired);
  const writeConflict = usePlanner((state) => state.writeConflict);
  const saveError = usePlanner((state) => state.saveError);
  const history = usePlanner((state) => state.history);
  const saveStatus = usePlanner((state) => state.saveStatus);
  const storageKind = usePlanner((state) => state.storageKind);
  const lastSavedAt = usePlanner((state) => state.lastSavedAt);
  const backups = usePlanner((state) => state.backups);
  const document_ = history.present;
  const scenario = activeScenario(document_);
  const regions = scenario.regions;
  const { commit, navigate, undo, redo } = plannerStore.getState();

  useEffect(() => { void plannerStore.getState().init(); }, []);
  useEffect(() => {
    let active = true;
    setError('');
    Promise.all([clubRepository.getDatabase(), municipalityRepository.getMunicipalities()])
      .then(([clubData, municipalityData]) => { if (active) { setClubs(clubData); setDataset(municipalityData); } })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Aineiston lataus epäonnistui.'); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch { /* storage unavailable */ }
  }, [dark]);
  useEffect(() => {
    const flush = () => { void plannerStore.getState().flush(); };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
      else if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const placements = useMemo(() => clubs && dataset ? assignClubs(clubs.data, dataset) : [], [clubs, dataset]);
  const filtered = useMemo(() => dataset ? filterPlacements(placements, filters, dataset, regions) : [], [placements, filters, dataset, regions]);
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(emptyFilters);
  const analysis = useMemo(() => dataset ? analyzeScenario(regions, dataset, filtered) : null, [regions, dataset, filtered]);
  const fullAggregates = useMemo(() => dataset ? aggregateByMunicipality(placements, dataset) : new Map(), [placements, dataset]);
  const warnings = useMemo(() => dataset && analysis ? validateScenario(regions, dataset, analysis) : [], [regions, dataset, analysis]);
  const membership = useMemo(() => {
    const map = new Map<string, Region[]>();
    for (const region of regions) for (const code of new Set(region.municipalityCodes)) map.set(code, [...(map.get(code) ?? []), region]);
    return map;
  }, [regions]);
  const mapRegions = useMemo(() => regions.filter((region) => region.enabled && region.visible && (filters.regionIds.length === 0 || filters.regionIds.includes(region.id))), [regions, filters.regionIds]);
  const unassignedCodes = useMemo(() => highlightUnassigned && analysis ? new Set(analysis.unassigned.map((row) => row.municipality.code)) : null, [highlightUnassigned, analysis]);
  const matchCodes = useMemo(() => {
    const needle = normalizeName(filters.municipalityQuery);
    if (!needle || !dataset) return null;
    return new Set(dataset.municipalities.filter((item) => normalizeName(item.name).includes(needle) || normalizeName(item.nameSv ?? '').includes(needle)).map((item) => item.code));
  }, [filters.municipalityQuery, dataset]);
  const maxMembers = useMemo(() => placements.reduce((max, { club }) => Math.max(max, club.jasenmaara ?? 0), 0), [placements]);
  const votingOptions = useMemo(() => [...new Set([10, 15, 20, ...placements.flatMap(({ club }) => club.aanimaara === null ? [] : [club.aanimaara])])].sort((a, b) => a - b), [placements]);

  const selectedRegion = regions.find((region) => region.id === selectedRegionId) ?? null;
  const editingRegion = editing ? selectedRegion : null;

  const selectRegion = useCallback((id: string) => { setSelectedRegionId(id); setSelectedMunicipality(null); setEditing(false); setView('map'); }, []);
  const createRegion = () => {
    let createdId = '';
    commit('Alueen luonti', (current) => { const result = documentOps.addRegion(current); createdId = result.region.id; return result.document; });
    setSelectedRegionId(createdId); setEditing(true); setSelectedMunicipality(null); setView('map');
  };
  const duplicateRegion = (id: string) => {
    let createdId: string | null = null;
    commit('Alueen monistus', (current) => { const result = documentOps.duplicateRegion(current, id); createdId = result.region?.id ?? null; return result.document; });
    if (createdId) { setSelectedRegionId(createdId); setEditing(false); }
  };
  const deleteRegion = (region: Region) => {
    if (!window.confirm(`Poistetaanko alue "${region.name}"? Toiminnon voi perua Kumoa-painikkeella.`)) return;
    commit(`Alueen ${region.name} poisto`, (current) => documentOps.deleteRegion(current, region.id));
    if (selectedRegionId === region.id) { setSelectedRegionId(null); setEditing(false); }
  };
  const updateRegion = (id: string, changes: RegionDraft, label: string, field: string) => commit(label, (current) => documentOps.updateRegion(current, id, changes), `${id}:${field}`);
  const setMunicipalities = (id: string, codes: string[], mode: 'add' | 'remove' | 'toggle', label: string) => commit(label, (current) => documentOps.setMunicipalities(current, id, codes, mode));
  const onMunicipalityClick = useCallback((code: string) => {
    if (editingRegion) {
      const name = dataset?.byCode.get(code)?.name ?? code;
      commit(`${editingRegion.municipalityCodes.includes(code) ? 'Poistettu' : 'Lisätty'} kunta ${name}`, (current) => documentOps.setMunicipalities(current, editingRegion.id, [code], 'toggle'));
    } else {
      setSelectedMunicipality(code);
    }
  }, [editingRegion, dataset, commit]);

  const exportContext = (scope: 'all' | 'active'): ExportContext | null => dataset ? { document: document_, dataset, placements, clubMetadata: clubs?.metadata ?? null, scope } : null;
  const onExport = (format: 'json' | 'csv' | 'xlsx', scope: 'all' | 'active') => {
    const context = exportContext(scope);
    if (!context) return;
    if (format === 'json') download(exportJson(context), 'application/json', exportFileName('json'));
    else if (format === 'csv') download(exportCsv(context), 'text/csv;charset=utf-8', exportFileName('csv'));
    else download(exportXlsx(context) as BlobPart, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', exportFileName('xlsx'));
  };
  const onImport = async (result: ImportResult, mode: 'scenarios' | 'append' | 'replace') => {
    await plannerStore.getState().createBackup('Ennen tuontia');
    const imported = result.kind === 'document' ? result.scenarios.flatMap((item) => item.regions) : result.regions;
    if (mode === 'scenarios') commit('Skenaarioiden tuonti', (current) => documentOps.appendScenarios(current, result.scenarios));
    else if (mode === 'append') commit('Alueiden tuonti', (current) => documentOps.replaceRegions(current, [...activeScenario(current).regions, ...imported]));
    else commit('Alueiden korvaus tuonnilla', (current) => documentOps.replaceRegions(current, imported));
    await plannerStore.getState().flush();
    if (plannerStore.getState().saveStatus !== 'saved') throw new Error(plannerStore.getState().saveError ?? 'Tuontia ei tallennettu palvelimelle.');
    setSelectedRegionId(null); setEditing(false);
  };
  const onRestore = async (snapshot: Snapshot) => {
    if (!window.confirm(`Palautetaanko varmuuskopio ${new Date(snapshot.createdAt).toLocaleString('fi-FI')}? Nykytila tallennetaan varmuuskopioksi ennen palautusta.`)) return;
    setWriteActionError('');
    try {
      await plannerStore.getState().restoreBackup(snapshot.id);
      await plannerStore.getState().flush();
      if (plannerStore.getState().saveStatus !== 'saved') throw new Error(plannerStore.getState().saveError ?? 'Palautusta ei tallennettu palvelimelle.');
      setSelectedRegionId(null); setEditing(false);
    } catch (cause) {
      setWriteActionError(cause instanceof Error ? cause.message : 'Palautusta ei voitu tallentaa.');
    }
  };
  const deleteScenario = async (id: string) => {
    const target = document_.scenarios.find((item) => item.id === id);
    if (!target || !window.confirm(`Poistetaanko skenaario "${target.name}" ja sen ${target.regions.length} aluetta?`)) return;
    setWriteActionError('');
    try {
      await plannerStore.getState().createBackup(`Ennen skenaarion ${target.name} poistoa`);
      commit('Skenaarion poisto', (current) => documentOps.deleteScenario(current, id));
      await plannerStore.getState().flush();
      if (plannerStore.getState().saveStatus !== 'saved') throw new Error(plannerStore.getState().saveError ?? 'Poistoa ei tallennettu palvelimelle.');
      setSelectedRegionId(null);
    } catch (cause) {
      setWriteActionError(cause instanceof Error ? cause.message : 'Skenaarion poistoa ei voitu tallentaa.');
    }
  };
  const createManualBackup = async () => {
    setWriteActionError('');
    try {
      await plannerStore.getState().createBackup('Käsin luotu');
    } catch (cause) {
      setWriteActionError(cause instanceof Error ? cause.message : 'Varmuuskopion luonti epäonnistui.');
    }
  };
  const switchScenario = (id: string) => { navigate((current) => documentOps.setActiveScenario(current, id)); setSelectedRegionId(null); setEditing(false); setFilters((current) => ({ ...current, regionIds: [] })); };
  const saveWithKey = async (action: 'save' | 'migrate' | 'empty') => {
    setWriteActionError('');
    plannerStore.getState().setWriteKey(writeKey);
    try {
      if (action === 'migrate') await plannerStore.getState().migrateLocalData();
      else if (action === 'empty') await plannerStore.getState().startEmpty();
      else {
        await plannerStore.getState().flush();
        if (plannerStore.getState().saveStatus !== 'saved') return;
      }
      setWriteActionError('');
      setWriteKey('');
    } catch (cause) {
      setWriteActionError(cause instanceof Error ? cause.message : 'Toiminto epäonnistui.');
    }
  };
  const reloadSharedPlan = async () => {
    if (!window.confirm('Ladataanko palvelimen uusin suunnitelma? Tämän selaimen tallentamattomat muutokset hylätään.')) return;
    setWriteActionError('');
    try {
      await plannerStore.getState().reloadRemote();
    } catch (cause) {
      setWriteActionError(cause instanceof Error ? cause.message : 'Palvelimen suunnitelman lataaminen epäonnistui.');
    }
  };

  const lastUndo = history.past[history.past.length - 1]?.label;
  const nextRedo = history.future[0]?.label;
  const loading = !error && (!ready || !dataset || !clubs || !analysis || migrationAvailable || (remoteMode && Boolean(loadError)));

  return (
    <div className="planner-shell">
      <header className="planner-topbar">
        <a className="planner-back" href="#/" title="Takaisin seurakarttaan"><ArrowLeft size={16} aria-hidden="true" /> Seurakartta</a>
        <div className="planner-brand"><span className="brand-mark"><span /></span><div><h1>ALUESUUNNITTELU</h1><small>SUOMEN FRISBEEGOLFLIITTO</small></div></div>
        <label className="scenario-switch">
          <span>Skenaario</span>
          <select aria-label="Skenaario" value={document_.activeScenarioId} onChange={(event) => switchScenario(event.target.value)}>
            {document_.scenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <div className="history-buttons">
          <button type="button" className="icon-button" onClick={undo} disabled={!lastUndo} aria-label={lastUndo ? `Kumoa: ${lastUndo}` : 'Kumoa'} title={lastUndo ? `Kumoa: ${lastUndo} (Ctrl+Z)` : 'Ei kumottavaa'}><Undo2 size={17} /></button>
          <button type="button" className="icon-button" onClick={redo} disabled={!nextRedo} aria-label={nextRedo ? `Tee uudelleen: ${nextRedo}` : 'Tee uudelleen'} title={nextRedo ? `Tee uudelleen: ${nextRedo} (Ctrl+Y)` : 'Ei uudelleen tehtävää'}><Redo2 size={17} /></button>
          <span className="history-count" aria-label={`${history.past.length} kumottavaa muutosta`}>{history.past.length}</span>
        </div>
        <SaveIndicator status={saveStatus} storage={storageKind} lastSavedAt={lastSavedAt} />
        <button type="button" className="icon-button" onClick={() => setDark((value) => !value)} aria-label={dark ? 'Vaihda vaaleaan teemaan' : 'Vaihda tummaan teemaan'}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
      </header>
      <nav className="planner-tabs" aria-label="Aluesuunnittelun näkymät">
        {VIEWS.map((item) => (
          <button key={item.id} type="button" className={view === item.id ? 'active' : ''} aria-current={view === item.id ? 'page' : undefined} onClick={() => setView(item.id)}>
            {item.label}{item.id === 'unassigned' && analysis && analysis.unassigned.length > 0 && <span className="tab-badge">{analysis.unassigned.length}</span>}
          </button>
        ))}
      </nav>

      {migrationAvailable && (
        <section className="planner-card">
          <h2 className="card-title">Palvelin ei sisällä vielä suunnitelmaa</h2>
          <p>Selaimesta löytyi aiempi suunnitelma. Sitä ei siirretty automaattisesti eikä palvelimen tietoja ylikirjoiteta.</p>
          <label className="field">Palvelimen kirjoitusavain<input type="password" autoComplete="current-password" value={writeKey} onChange={(event) => setWriteKey(event.target.value)} /></label>
          <div className="button-row">
            <button type="button" className="primary-button" disabled={!writeKey} onClick={() => void saveWithKey('migrate')}>Siirrä selaimen suunnitelma palvelimelle</button>
            <button type="button" className="secondary-button" disabled={!writeKey} onClick={() => void saveWithKey('empty')}>Aloita tyhjällä suunnitelmalla</button>
          </div>
          {writeActionError && <p className="field-error" role="alert">{writeActionError}</p>}
        </section>
      )}
      {writeAuthRequired && !migrationAvailable && (
        <section className="planner-card" role="alert">
          <h2 className="card-title">Palvelintallennus vaatii kirjoitusavaimen</h2>
          <p>{saveError} Avain pidetään vain tämän välilehden muistissa.</p>
          <form className="inline-form" onSubmit={(event) => { event.preventDefault(); void saveWithKey('save'); }}>
            <label className="field grow">Palvelimen kirjoitusavain<input type="password" autoComplete="current-password" value={writeKey} onChange={(event) => setWriteKey(event.target.value)} /></label>
            <button type="submit" className="primary-button" disabled={!writeKey}>Yritä tallentaa</button>
          </form>
          {writeActionError && <p className="field-error" role="alert">{writeActionError}</p>}
        </section>
      )}
      {writeConflict && (
        <section className="planner-card" role="alert">
          <h2 className="card-title">Palvelimen suunnitelmaa on muutettu muualla</h2>
          <p>{saveError} Tallennusta ei yritetty ylikirjoittamalla palvelimen uudempaa versiota.</p>
          <button type="button" className="secondary-button" onClick={() => void reloadSharedPlan()}>Lataa palvelimen versio</button>
          {writeActionError && <p className="field-error" role="alert">{writeActionError}</p>}
        </section>
      )}
      {writeActionError && !migrationAvailable && !writeAuthRequired && !writeConflict && <p className="notice" role="alert">{writeActionError}</p>}
      {saveStatus === 'error' && !writeAuthRequired && !writeConflict && !writeActionError && <p className="notice" role="alert">{saveError ?? 'Tallennus epäonnistui.'}</p>}
      {error && <div className="error-banner" role="alert"><AlertCircle size={20} /><div><strong>Aineistoa ei voitu ladata</strong><span>{error}</span><button className="clear-filters" onClick={() => setAttempt((value) => value + 1)}>Yritä uudelleen</button></div></div>}
      {loadError && remoteMode && <div className="error-banner" role="alert"><AlertCircle size={20} /><div><strong>Yhteistä suunnitelmaa ei voitu ladata</strong><span>{loadError}</span><button className="clear-filters" onClick={() => void plannerStore.getState().retryInit()}>Yritä uudelleen</button></div></div>}
      {loadError && !remoteMode && <p className="notice" role="alert">Selaimen tallennustilaa ei voitu avata ({loadError}). Muutokset säilyvät vain tämän istunnon ajan.</p>}
      {loading && <div className="loading-state" role="status"><span className="loading-spinner" />{migrationAvailable ? 'Valitse, siirretäänkö selaimen suunnitelma palvelimelle vai aloitetaanko tyhjällä…' : 'Ladataan kuntarajoja, seuroja ja tallennettuja suunnitelmia…'}</div>}

      {!loading && dataset && analysis && clubs && (
        <main className="planner-main">
          {clubs.warnings.length > 0 && <p className="notice">{clubs.warnings.join(' ')}</p>}
          {view === 'map' && (
            <div className="planner-map-layout">
              <aside className="planner-sidebar" aria-label="Alueet ja suodattimet">
                <RegionList regions={regions} stats={analysis.stats} selectedRegionId={selectedRegionId} onSelect={selectRegion} onCreate={createRegion}
                  onEdit={(id) => { setSelectedRegionId(id); setEditing(true); setSelectedMunicipality(null); }} onDuplicate={duplicateRegion} onDelete={deleteRegion}
                  onToggle={(region, field) => updateRegion(region.id, { [field]: !region[field] }, `${field === 'visible' ? (region.visible ? 'Piilotettu' : 'Näytetty') : (region.enabled ? 'Poistettu käytöstä' : 'Otettu käyttöön')}: ${region.name}`, field)} />
                <PlannerFilters filters={filters} regions={regions} maxMembers={Math.max(1, maxMembers)} votingOptions={votingOptions} onChange={setFilters} />
              </aside>
              <section className="planner-map-column" aria-label="Kartta">
                <div className="map-options" role="group" aria-label="Karttatasot">
                  <label className="checkbox"><input type="checkbox" checked={showClubs} onChange={(event) => setShowClubs(event.target.checked)} /> Seurat</label>
                  <label className="checkbox"><input type="checkbox" checked={highlightUnassigned} onChange={(event) => setHighlightUnassigned(event.target.checked)} /> Korosta kohdistamattomat</label>
                  <label className="checkbox"><input type="checkbox" checked={showBaseMap} onChange={(event) => setShowBaseMap(event.target.checked)} /> Taustakartta</label>
                  <span className="map-status" role="status" aria-live="polite">{filtered.length} / {placements.length} seuraa{filtersActive ? ' (suodatettu)' : ''}</span>
                </div>
                {editingRegion && <p className="edit-banner" role="status"><ColorDot color={editingRegion.color} /><span>Valintatila: napsauta kuntia lisätäksesi tai poistaaksesi ne alueesta <strong>{editingRegion.name}</strong>.</span></p>}
                <RegionMap dataset={dataset} regions={mapRegions} membership={membership} editingRegion={editingRegion} selectedRegionId={selectedRegionId} selectedMunicipalityCode={selectedMunicipality}
                  highlightCodes={unassignedCodes} matchCodes={matchCodes} aggregates={fullAggregates} placements={filtered} showClubs={showClubs} showBaseMap={showBaseMap} dark={dark}
                  onMunicipalityClick={onMunicipalityClick} onRegionSelect={selectRegion} />
                <div className="map-legend-bar" aria-label="Selite">
                  <span><i className="legend-swatch outline" /> Alueen raja</span>
                  <span><i className="legend-swatch dashed" /> Päällekkäinen alue</span>
                  {highlightUnassigned && <span><i className="legend-swatch unassigned" /> Kohdistamaton kunta</span>}
                  {showClubs && <span><i className="legend-dot" style={{ background: '#2563eb' }} />10 <i className="legend-dot" style={{ background: '#f59e0b' }} />15 <i className="legend-dot" style={{ background: '#dc2626' }} />20 ääntä · koko = jäsenmäärä</span>}
                </div>
              </section>
              <aside className="planner-panel" aria-label="Tiedot">
                {editingRegion && <RegionEditor region={editingRegion} dataset={dataset} aggregates={fullAggregates} membership={membership}
                  onChange={(changes, label, field) => updateRegion(editingRegion.id, changes, label, field)}
                  onMunicipalities={(codes, mode, label) => setMunicipalities(editingRegion.id, codes, mode, label)} onClose={() => setEditing(false)} />}
                {!editingRegion && selectedRegion && <RegionDetail region={selectedRegion} stats={analysis.stats.get(selectedRegion.id)!} explanation={explainCoverage(selectedRegion, analysis.stats.get(selectedRegion.id)!, analysis)}
                  warnings={warnings.filter((warning) => warning.regionId === selectedRegion.id)} onEdit={() => setEditing(true)} onDuplicate={() => duplicateRegion(selectedRegion.id)} onClose={() => setSelectedRegionId(null)} />}
                {!editingRegion && !selectedRegion && selectedMunicipality && dataset.byCode.get(selectedMunicipality) && (
                  <MunicipalityCard municipality={dataset.byCode.get(selectedMunicipality)!} aggregate={fullAggregates.get(selectedMunicipality)} regions={[...regions].sort((a, b) => a.number - b.number)} memberOf={membership.get(selectedMunicipality) ?? []}
                    onAdd={(regionId) => setMunicipalities(regionId, [selectedMunicipality], 'add', `Lisätty kunta ${dataset.byCode.get(selectedMunicipality)?.name}`)}
                    onRemove={(regionId) => setMunicipalities(regionId, [selectedMunicipality], 'remove', `Poistettu kunta ${dataset.byCode.get(selectedMunicipality)?.name}`)}
                    onSelectRegion={selectRegion} onClose={() => setSelectedMunicipality(null)} />
                )}
                {!editingRegion && !selectedRegion && !selectedMunicipality && (
                  <section className="planner-card">
                    <header className="card-header"><div><h2>{scenario.name}</h2><p>{regions.length} aluetta · {analysis.assignedCodes.size}/{dataset.municipalities.length} kuntaa kohdistettu</p></div></header>
                    <p className="hint">Valitse alue luettelosta tai kartalta, tai napsauta kuntaa nähdäksesi sen seurat ja alueet.</p>
                    <h3>Tarkistukset</h3>
                    <WarningList warnings={warnings} onSelectRegion={selectRegion} />
                  </section>
                )}
              </aside>
            </div>
          )}
          {view === 'dashboard' && <DashboardView analysis={analysis} regions={regions} dataset={dataset} scenarioCount={document_.scenarios.length} scenarioName={scenario.name} warnings={warnings} filtered={filtersActive} onSelectRegion={selectRegion} />}
          {view === 'compare' && <ComparisonView regions={regions} analysis={analysis} onSelectRegion={selectRegion} />}
          {view === 'unassigned' && <UnassignedView analysis={analysis} regions={regions} onShowOnMap={() => { setHighlightUnassigned(true); setSelectedRegionId(null); setEditing(false); setView('map'); }}
            onAssign={(regionId, codes) => setMunicipalities(regionId, codes, 'add', `Kohdistettu ${codes.length} kuntaa`)} />}
          {view === 'scenarios' && <ScenarioManager document={document_}
            onCreate={(name) => { commit('Skenaarion luonti', (current) => documentOps.addScenario(current, name)); setSelectedRegionId(null); }}
            onRename={(id, name) => commit('Skenaarion nimeäminen', (current) => documentOps.renameScenario(current, id, name))}
            onDuplicate={(id) => { commit('Skenaarion monistus', (current) => documentOps.duplicateScenario(current, id)); setSelectedRegionId(null); }}
            onDelete={(id) => void deleteScenario(id)}
            onSwitch={switchScenario} />}
          {view === 'backups' && <BackupManager backups={backups} current={document_} onCreate={() => void createManualBackup()} onRestore={(snapshot) => void onRestore(snapshot)} />}
          {view === 'data' && <DataManager onExport={onExport} onImport={onImport} knownCodes={new Set(dataset.byCode.keys())} />}
        </main>
      )}
      <footer className="planner-footer">Kuntarajat © Tilastokeskus, kunta1000k 2025 (CC BY 4.0) · Taustakartta © OpenStreetMap · {remoteMode ? 'Suunnitelmat tallentuvat yhteisesti palvelimelle' : 'Suunnitelmat tallentuvat tähän selaimeen'} ({storageKind ?? '…'}).</footer>
    </div>
  );
}
