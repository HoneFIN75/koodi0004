import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertCircle, ArrowLeft, LogIn, LogOut, Moon, Redo2, Shield, Sun, Undo2 } from 'lucide-react';
import { clubRepository } from '../data/clubRepository';
import { PopulationExplorer } from '../components/PopulationExplorer';
import { CompetitionFilters } from '../components/CompetitionFilters';
import { CompetitionAnalytics } from '../components/CompetitionAnalytics';
import { useCompetitionData } from '../state/useCompetitions';
import { municipalityRepository } from '../data/municipalityRepository';
import { provinceRepository } from '../data/provinceRepository.ts';
import { getProvinceCoverageIssues, getProvinceStatistics } from '../services/provinceAnalytics.ts';
import { getCompetitionStatistics } from '../services/competitionService.ts';
import { ProvinceComparison } from '../components/ProvinceComparison.tsx';
import { useProvinceSettings } from '../hooks/useProvinceSettings.ts';
import { ProvinceOverlayControls } from '../components/ProvinceOverlayControls.tsx';
import type { Database } from '../models/club';
import type { ProvinceDataset } from '../models/province.ts';
import type { MunicipalityDataset, Region, RegionDraft, Snapshot } from '../models/region';
import { exportCsv, exportFileName, exportJson, exportXlsx, type ExportContext } from '../services/exportService';
import { authService, type AuthRole, type AuthSession } from '../services/authService';
import { activeScenario, documentOps, type ImportResult } from '../services/plannerDocument';
import { aggregateByMunicipality, analyzeScenario, assignClubs, emptyFilters, explainCoverage, filterPlacements, normalizeName, type PlannerFilters as Filters } from '../services/regionAnalytics';
import { validateScenario } from '../services/validationService';
import { VOTING_POWERS } from '../services/membershipRules.ts';
import { markerColor } from '../services/mapService';
import { plannerStore } from '../state/plannerStore';
import { usePlanner } from '../state/usePlanner';
import { BackupManager } from './components/BackupManager';
import { ClubsAdmin } from './ClubsAdmin';
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

type View = 'map' | 'dashboard' | 'compare' | 'unassigned' | 'scenarios' | 'backups' | 'data' | 'clubs';
const CLUBS_ADMIN_ROUTE = '#/alueet/seurahallinta';
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
  const { index: competitionIndex, yearFilter, error: competitionError } = useCompetitionData();
  const competitionContext = useMemo(() => ({ index: competitionIndex, yearFilter }), [competitionIndex, yearFilter]);
  const [clubs, setClubs] = useState<Database | null>(null);
  const [dataset, setDataset] = useState<MunicipalityDataset | null>(null);
  const [provinces, setProvinces] = useState<ProvinceDataset | null>(null);
  const [provinceError, setProvinceError] = useState('');
  const [provinceSettings, setProvinceSettings] = useProvinceSettings();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<View>(() => window.location.hash === CLUBS_ADMIN_ROUTE ? 'clubs' : 'map');
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [selectedMunicipality, setSelectedMunicipality] = useState<string | null>(null);
  const [highlightUnassigned, setHighlightUnassigned] = useState(false);
  const [showClubs, setShowClubs] = useState(true);
  const [showBaseMap, setShowBaseMap] = useState(true);
  const [populationLayer, setPopulationLayer] = useState(false);
  const [dark, setDark] = useState(() => { try { return localStorage.getItem(THEME_KEY) !== 'light'; } catch { return true; } });
  const [authSession, setAuthSession] = useState<AuthSession>({ authReady: false, role: null, csrfToken: '' });
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [loginRole, setLoginRole] = useState<AuthRole>('writer');
  const [loginPassword, setLoginPassword] = useState('');
  const [authOpen, setAuthOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [passwordForms, setPasswordForms] = useState<Record<AuthRole, { current: string; next: string; confirmation: string }>>({
    writer: { current: '', next: '', confirmation: '' },
    admin: { current: '', next: '', confirmation: '' },
  });
  const [viewScenarioId, setViewScenarioId] = useState<string | null>(null);
  const [writeActionError, setWriteActionError] = useState('');

  const ready = usePlanner((state) => state.ready);
  const loadError = usePlanner((state) => state.loadError);
  const remoteMode = usePlanner((state) => state.remoteMode);
  const migrationAvailable = usePlanner((state) => state.migrationAvailable);
  const authRequired = usePlanner((state) => state.authRequired);
  const writeConflict = usePlanner((state) => state.writeConflict);
  const saveError = usePlanner((state) => state.saveError);
  const history = usePlanner((state) => state.history);
  const saveStatus = usePlanner((state) => state.saveStatus);
  const storageKind = usePlanner((state) => state.storageKind);
  const lastSavedAt = usePlanner((state) => state.lastSavedAt);
  const backups = usePlanner((state) => state.backups);
  const document_ = history.present;
  const canWrite = !import.meta.env.PROD || authSession.role === 'writer' || authSession.role === 'admin';
  const displayedDocument = canWrite || !viewScenarioId ? document_ : { ...document_, activeScenarioId: viewScenarioId };
  const scenario = activeScenario(displayedDocument);
  const regions = scenario.regions;
  const { commit, navigate, undo, redo } = plannerStore.getState();

  useEffect(() => {
    void plannerStore.getState().init();
    if (!import.meta.env.PROD) {
      setAuthLoading(false);
      return;
    }
    authService.getSession().then((session) => {
      plannerStore.getState().setCsrfToken(session.csrfToken);
      setAuthSession(session);
    }).catch((cause: unknown) => {
      setAuthError(cause instanceof Error ? cause.message : 'Kirjautumistietoja ei voitu ladata.');
    }).finally(() => setAuthLoading(false));
  }, []);
  useEffect(() => {
    const syncRoute = () => setView(window.location.hash === CLUBS_ADMIN_ROUTE ? 'clubs' : 'map');
    window.addEventListener('hashchange', syncRoute);
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);
  useEffect(() => {
    if (!authRequired) return;
    authService.getSession().then((session) => {
      plannerStore.getState().setCsrfToken(session.csrfToken);
      setAuthSession(session);
      setAuthOpen(true);
      setAuthError('Kirjautuminen vanheni. Kirjaudu uudelleen tallentaaksesi muutokset.');
    }).catch((cause: unknown) => {
      setAuthError(cause instanceof Error ? cause.message : 'Kirjautumistietoja ei voitu tarkistaa.');
    });
  }, [authRequired]);
  useEffect(() => {
    let active = true;
    setError('');
    Promise.all([clubRepository.getDatabase(), municipalityRepository.getMunicipalities()])
      .then(([clubData, municipalityData]) => { if (active) { setClubs(clubData); setDataset(municipalityData); } })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Aineiston lataus epäonnistui.'); });
    provinceRepository.getProvinces()
      .then((result) => { if (active) { setProvinces(result); setProvinceError(''); } })
      .catch((cause: unknown) => { if (active) setProvinceError(cause instanceof Error ? cause.message : 'Maakuntatietojen lataus epäonnistui.'); });
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
      if (!canWrite || !(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
      else if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canWrite, undo, redo]);

  const placements = useMemo(() => clubs && dataset ? assignClubs(clubs.data, dataset) : [], [clubs, dataset]);
  const filtered = useMemo(() => dataset ? filterPlacements(placements, filters, dataset, regions) : [], [placements, filters, dataset, regions]);
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(emptyFilters);
  const analysis = useMemo(() => dataset ? analyzeScenario(regions, dataset, filtered, competitionContext) : null, [regions, dataset, filtered, competitionContext]);
  const provinceStatistics = useMemo(() => dataset && provinces
    ? getProvinceStatistics(provinces, dataset, filtered.map(({ club }) => club),
      new Map(filtered.map(({ club, municipalityCode }) => [club, municipalityCode])),
      competitionIndex ? getCompetitionStatistics(competitionIndex, yearFilter, {}, dataset.municipalities) : null)
    : [], [dataset, provinces, filtered, competitionIndex, yearFilter]);
  const provinceCoverageIssues = useMemo(() => dataset && provinces
    ? getProvinceCoverageIssues(provinces, dataset) : [], [dataset, provinces]);
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
  const votingOptions = VOTING_POWERS;

  const selectedRegion = regions.find((region) => region.id === selectedRegionId) ?? null;
  const editingRegion = editing ? selectedRegion : null;

  const selectRegion = useCallback((id: string) => { setSelectedRegionId(id); setSelectedMunicipality(null); setEditing(false); setView('map'); }, []);
  const createRegion = () => {
    if (!canWrite) return;
    let createdId = '';
    commit('Alueen luonti', (current) => { const result = documentOps.addRegion(current); createdId = result.region.id; return result.document; });
    setSelectedRegionId(createdId); setEditing(true); setSelectedMunicipality(null); setView('map');
  };
  const duplicateRegion = (id: string) => {
    if (!canWrite) return;
    let createdId: string | null = null;
    commit('Alueen monistus', (current) => { const result = documentOps.duplicateRegion(current, id); createdId = result.region?.id ?? null; return result.document; });
    if (createdId) { setSelectedRegionId(createdId); setEditing(false); }
  };
  const deleteRegion = (region: Region) => {
    if (!canWrite) return;
    if (!window.confirm(`Poistetaanko alue "${region.name}"? Toiminnon voi perua Kumoa-painikkeella.`)) return;
    commit(`Alueen ${region.name} poisto`, (current) => documentOps.deleteRegion(current, region.id));
    if (selectedRegionId === region.id) { setSelectedRegionId(null); setEditing(false); }
  };
  const updateRegion = (id: string, changes: RegionDraft, label: string, field: string) => { if (canWrite) commit(label, (current) => documentOps.updateRegion(current, id, changes), `${id}:${field}`); };
  const setMunicipalities = (id: string, codes: string[], mode: 'add' | 'remove' | 'toggle', label: string) => { if (canWrite) commit(label, (current) => documentOps.setMunicipalities(current, id, codes, mode)); };
  const onMunicipalityClick = useCallback((code: string) => {
    if (editingRegion && canWrite) {
      const name = dataset?.byCode.get(code)?.name ?? code;
      commit(`${editingRegion.municipalityCodes.includes(code) ? 'Poistettu' : 'Lisätty'} kunta ${name}`, (current) => documentOps.setMunicipalities(current, editingRegion.id, [code], 'toggle'));
    } else {
      setSelectedMunicipality(code);
    }
  }, [canWrite, editingRegion, dataset, commit]);

  const exportContext = (scope: 'all' | 'active'): ExportContext | null => dataset ? { document: displayedDocument, dataset, placements, clubMetadata: clubs?.metadata ?? null, scope, competitions: competitionContext } : null;
  const onExport = (format: 'json' | 'csv' | 'xlsx', scope: 'all' | 'active') => {
    if (!competitionIndex || competitionError) {
      setWriteActionError('Raporttia ei viety: kilpailuaineistoa ei ole ladattu tai sen päivitys epäonnistui. Päivitä kilpailuaineisto ja yritä uudelleen.');
      return;
    }
    setWriteActionError('');
    const context = exportContext(scope);
    if (!context) return;
    if (format === 'json') download(exportJson(context), 'application/json', exportFileName('json'));
    else if (format === 'csv') download(exportCsv(context), 'text/csv;charset=utf-8', exportFileName('csv'));
    else download(exportXlsx(context) as BlobPart, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', exportFileName('xlsx'));
  };
  const onImport = async (result: ImportResult, mode: 'scenarios' | 'append' | 'replace') => {
    if (!canWrite) throw new Error('Kirjautuminen Writer- tai Admin-tunnuksella vaaditaan.');
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
  const selectScenario = (id: string) => {
    setSelectedRegionId(null);
    setEditing(false);
    setFilters((current) => ({ ...current, regionIds: [] }));
    if (canWrite) switchScenario(id);
    else setViewScenarioId(id);
  };
  const refreshSession = (session: AuthSession) => {
    plannerStore.getState().setCsrfToken(session.csrfToken);
    setAuthSession(session);
  };
  const selectView = (next: View) => {
    setView(next);
    const route = next === 'clubs' ? CLUBS_ADMIN_ROUTE : '#/alueet';
    if (window.location.hash !== route) window.location.hash = route;
  };
  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');
    setAuthMessage('');
    try {
      const session = await authService.login(loginRole, loginPassword, authSession.csrfToken);
      refreshSession(session);
      setLoginPassword('');
      setAuthOpen(false);
      setViewScenarioId(null);
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : 'Kirjautuminen epäonnistui.');
    }
  };
  const logout = async () => {
    setAuthError('');
    setAuthMessage('');
    try {
      const session = await authService.logout(authSession.csrfToken);
      refreshSession(session);
      setViewScenarioId(null);
      setAdminOpen(false);
      setPasswordForms({ writer: { current: '', next: '', confirmation: '' }, admin: { current: '', next: '', confirmation: '' } });
      if (remoteMode) await plannerStore.getState().reloadRemote();
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : 'Uloskirjautuminen epäonnistui.');
    }
  };
  const changeAccountPassword = async (account: AuthRole, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = passwordForms[account];
    setAuthError('');
    setAuthMessage('');
    if (form.next !== form.confirmation) {
      setAuthError('Uusi salasana ja sen vahvistus eivät täsmää.');
      return;
    }
    try {
      const session = await authService.changePassword(account, form.current, form.next, authSession.csrfToken);
      refreshSession(session);
      setPasswordForms({ writer: { current: '', next: '', confirmation: '' }, admin: { current: '', next: '', confirmation: '' } });
      setAdminOpen(false);
      setAuthOpen(true);
      setAuthMessage('Salasana vaihdettiin. Kaikki istunnot mitätöitiin; kirjaudu uudelleen.');
      if (remoteMode) await plannerStore.getState().reloadRemote();
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : 'Salasanan vaihtaminen epäonnistui.');
    }
  };
  const migrateLocalPlan = async (action: 'migrate' | 'empty') => {
    if (!canWrite) return;
    setWriteActionError('');
    try {
      if (action === 'migrate') await plannerStore.getState().migrateLocalData();
      else if (action === 'empty') await plannerStore.getState().startEmpty();
      setWriteActionError('');
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
  const loading = !error && (!ready || !dataset || !clubs || !analysis || (remoteMode && Boolean(loadError)));

  return (
    <div className="planner-shell">
      <header className="planner-topbar">
        <a className="planner-back" href="#/" title="Takaisin seurakarttaan"><ArrowLeft size={16} aria-hidden="true" /> Seurakartta</a>
        <div className="planner-brand"><span className="brand-mark"><span /></span><div><h1>ALUESUUNNITTELU</h1><small>SUOMEN FRISBEEGOLFLIITTO</small></div></div>
        <label className="scenario-switch">
          <span>Skenaario</span>
          <select aria-label="Skenaario" value={scenario.id} onChange={(event) => selectScenario(event.target.value)}>
            {displayedDocument.scenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        {canWrite && <div className="history-buttons">
          <button type="button" className="icon-button" onClick={undo} disabled={!lastUndo} aria-label={lastUndo ? `Kumoa: ${lastUndo}` : 'Kumoa'} title={lastUndo ? `Kumoa: ${lastUndo} (Ctrl+Z)` : 'Ei kumottavaa'}><Undo2 size={17} /></button>
          <button type="button" className="icon-button" onClick={redo} disabled={!nextRedo} aria-label={nextRedo ? `Tee uudelleen: ${nextRedo}` : 'Tee uudelleen'} title={nextRedo ? `Tee uudelleen: ${nextRedo} (Ctrl+Y)` : 'Ei uudelleen tehtävää'}><Redo2 size={17} /></button>
          <span className="history-count" aria-label={`${history.past.length} kumottavaa muutosta`}>{history.past.length}</span>
        </div>}
        {canWrite
          ? <SaveIndicator status={saveStatus} storage={storageKind} lastSavedAt={lastSavedAt} />
          : <span className="save-indicator">Vain luku</span>}
        {import.meta.env.PROD && authSession.role === 'admin' && <button type="button" className={`auth-control${adminOpen ? ' active' : ''}`} onClick={() => { setAdminOpen((value) => !value); setAuthOpen(false); }} aria-expanded={adminOpen}><Shield size={15} /> Admin</button>}
        {import.meta.env.PROD && authSession.role ? (
          <button type="button" className="auth-control" onClick={() => void logout()}><LogOut size={15} /> Kirjaudu ulos ({authSession.role === 'admin' ? 'Admin' : 'Kirjoittaja'})</button>
        ) : import.meta.env.PROD ? (
          <button type="button" className="auth-control" onClick={() => { setAuthOpen((value) => !value); setAdminOpen(false); }} aria-expanded={authOpen}><LogIn size={15} /> Kirjaudu</button>
        ) : null}
        <button type="button" className="icon-button" onClick={() => setDark((value) => !value)} aria-label={dark ? 'Vaihda vaaleaan teemaan' : 'Vaihda tummaan teemaan'}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
      </header>
      {import.meta.env.PROD && (authOpen || adminOpen) && (
        <section className="planner-card auth-panel" aria-label={adminOpen ? 'Ylläpito' : 'Kirjautuminen'}>
          {authLoading && <p role="status">Tarkistetaan kirjautumista…</p>}
          {!authLoading && authOpen && !authSession.role && (
            <form className="auth-form" onSubmit={(event) => void login(event)}>
              <div><h2 className="card-title">Kirjaudu Aluesuunnitteluun</h2><p className="hint">Julkinen katselu ei vaadi kirjautumista.</p></div>
              {!authSession.authReady && <p className="notice">Kirjautumista ei ole vielä alustettu palvelimelle. Pyydä ylläpitäjää suorittamaan käyttöönotto-ohjeen kertaluonteinen CLI-alustus.</p>}
              <label className="field">Tunnus
                <select value={loginRole} onChange={(event) => setLoginRole(event.target.value as AuthRole)}>
                  <option value="writer">Kirjoittaja</option><option value="admin">Admin</option>
                </select>
              </label>
              <label className="field">Salasana<input type="password" autoComplete="current-password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} required /></label>
              <button type="submit" className="primary-button" disabled={!authSession.authReady || authLoading}>Kirjaudu</button>
            </form>
          )}
          {adminOpen && authSession.role === 'admin' && (
            <div className="admin-panel">
              <div><h2 className="card-title">Admin · tunnusten hallinta</h2><p className="hint">Tunnukset ovat yhteisiä. Salasanan vaihtaminen kirjaa kaikki käyttäjät ulos.</p></div>
              {(['writer', 'admin'] as const).map((account) => (
                <form key={account} className="password-form" onSubmit={(event) => void changeAccountPassword(account, event)}>
                  <h3>{account === 'writer' ? 'Kirjoittajan salasana' : 'Adminin salasana'}</h3>
                  <label className="field">Nykyinen Admin-salasana<input type="password" autoComplete="current-password" value={passwordForms[account].current} onChange={(event) => setPasswordForms((forms) => ({ ...forms, [account]: { ...forms[account], current: event.target.value } }))} required /></label>
                  <label className="field">Uusi salasana<input type="password" autoComplete="new-password" minLength={12} value={passwordForms[account].next} onChange={(event) => setPasswordForms((forms) => ({ ...forms, [account]: { ...forms[account], next: event.target.value } }))} required /></label>
                  <label className="field">Vahvista uusi salasana<input type="password" autoComplete="new-password" minLength={12} value={passwordForms[account].confirmation} onChange={(event) => setPasswordForms((forms) => ({ ...forms, [account]: { ...forms[account], confirmation: event.target.value } }))} required /></label>
                  <button type="submit" className="primary-button">Vaihda {account === 'writer' ? 'Kirjoittajan' : 'Adminin'} salasana</button>
                </form>
              ))}
            </div>
          )}
          {authError && <p className="field-error" role="alert">{authError}</p>}
          {authMessage && <p className="validation-ok" role="status">{authMessage}</p>}
          {authSession.role && !adminOpen && <p className="hint">Kirjautunut: {authSession.role === 'admin' ? 'Admin' : 'Kirjoittaja'}.</p>}
        </section>
      )}
      <nav className="planner-tabs" aria-label="Aluesuunnittelun näkymät">
        {VIEWS.map((item) => (
          <button key={item.id} type="button" className={view === item.id ? 'active' : ''} aria-current={view === item.id ? 'page' : undefined} onClick={() => selectView(item.id)}>
            {item.label}{item.id === 'unassigned' && analysis && analysis.unassigned.length > 0 && <span className="tab-badge">{analysis.unassigned.length}</span>}
          </button>
        ))}
        {authSession.role === 'admin' && <button type="button" className={view === 'clubs' ? 'active' : ''} aria-current={view === 'clubs' ? 'page' : undefined} onClick={() => selectView('clubs')}>Seurahallinta</button>}
      </nav>
      <CompetitionFilters />
      {adminOpen && <CompetitionAnalytics geography={dataset?.municipalities} title="Ylläpidon kilpailutilastot" />}

      {migrationAvailable && canWrite && (
        <section className="planner-card">
          <h2 className="card-title">Palvelin ei sisällä vielä suunnitelmaa</h2>
          <p>Selaimesta löytyi aiempi suunnitelma. Se on näkyvissä tässä selaimessa, mutta sitä ei siirretä automaattisesti eikä palvelimen tietoja ylikirjoiteta.</p>
          <div className="button-row">
            <button type="button" className="primary-button" onClick={() => void migrateLocalPlan('migrate')}>Siirrä selaimen suunnitelma palvelimelle</button>
            <button type="button" className="secondary-button" onClick={() => void migrateLocalPlan('empty')}>Aloita tyhjällä suunnitelmalla</button>
          </div>
          {writeActionError && <p className="field-error" role="alert">{writeActionError}</p>}
        </section>
      )}
      {migrationAvailable && !canWrite && (
        <p className="notice">Tässä selaimessa on aiempi paikallinen suunnitelma. Kirjaudu Kirjoittaja- tai Admin-tunnuksella, jos haluat siirtää sen palvelimelle.</p>
      )}
      {writeConflict && (
        <section className="planner-card" role="alert">
          <h2 className="card-title">Palvelimen suunnitelmaa on muutettu muualla</h2>
          <p>{saveError} Tallennusta ei yritetty ylikirjoittamalla palvelimen uudempaa versiota.</p>
          <button type="button" className="secondary-button" onClick={() => void reloadSharedPlan()}>Lataa palvelimen versio</button>
          {writeActionError && <p className="field-error" role="alert">{writeActionError}</p>}
        </section>
      )}
      {authRequired && !canWrite && <p className="notice" role="alert">Kirjoittaminen vaatii kirjautumisen. {saveError}</p>}
      {writeActionError && !migrationAvailable && !authRequired && !writeConflict && <p className="notice" role="alert">{writeActionError}</p>}
      {saveStatus === 'error' && !authRequired && !writeConflict && !writeActionError && <p className="notice" role="alert">{saveError ?? 'Tallennus epäonnistui.'}</p>}
      {error && <div className="error-banner" role="alert"><AlertCircle size={20} /><div><strong>Aineistoa ei voitu ladata</strong><span>{error}</span><button className="clear-filters" onClick={() => setAttempt((value) => value + 1)}>Yritä uudelleen</button></div></div>}
      {provinceError && <p className="notice" role="alert">Maakuntatietojen lataus epäonnistui: {provinceError} <button type="button" className="text-button" onClick={() => setAttempt((value) => value + 1)}>Yritä uudelleen</button></p>}
      {loadError && remoteMode && <div className="error-banner" role="alert"><AlertCircle size={20} /><div><strong>Yhteistä suunnitelmaa ei voitu ladata</strong><span>{loadError}</span><button className="clear-filters" onClick={() => void plannerStore.getState().retryInit()}>Yritä uudelleen</button></div></div>}
      {loadError && !remoteMode && <p className="notice" role="alert">Selaimen tallennustilaa ei voitu avata ({loadError}). Muutokset säilyvät vain tämän istunnon ajan.</p>}
      {loading && <div className="loading-state" role="status"><span className="loading-spinner" />{migrationAvailable ? 'Valitse, siirretäänkö selaimen suunnitelma palvelimelle vai aloitetaanko tyhjällä…' : 'Ladataan kuntarajoja, seuroja ja tallennettuja suunnitelmia…'}</div>}

      {view === 'clubs' && (authSession.role === 'admin'
        ? <ClubsAdmin csrfToken={authSession.csrfToken} />
        : <section className="planner-card clubs-admin-denied" role="alert">
          <h2 className="card-title">Seurahallinta on vain Adminille</h2>
          <p>Kirjaudu Admin-tunnuksella käyttääksesi seurojen hallintaa.</p>
        </section>)}

      {view !== 'clubs' && !loading && dataset && analysis && clubs && (
        <main className="planner-main">
          {clubs.warnings.length > 0 && <p className="notice">{clubs.warnings.join(' ')}</p>}
          {provinceCoverageIssues.length > 0 && <p className="notice" role="status">{provinceCoverageIssues.join(' ')}</p>}
          {view === 'map' && (
            <div className="planner-map-layout">
              <aside className="planner-sidebar" aria-label="Alueet ja suodattimet">
                <RegionList regions={regions} stats={analysis.stats} selectedRegionId={selectedRegionId} onSelect={selectRegion} onCreate={createRegion} readOnly={!canWrite}
                  onEdit={(id) => { setSelectedRegionId(id); setEditing(true); setSelectedMunicipality(null); }} onDuplicate={duplicateRegion} onDelete={deleteRegion}
                  onToggle={(region, field) => updateRegion(region.id, { [field]: !region[field] }, `${field === 'visible' ? (region.visible ? 'Piilotettu' : 'Näytetty') : (region.enabled ? 'Poistettu käytöstä' : 'Otettu käyttöön')}: ${region.name}`, field)} />
                <PlannerFilters filters={filters} regions={regions} maxMembers={Math.max(1, maxMembers)} votingOptions={votingOptions} onChange={setFilters} />
              </aside>
              <section className="planner-map-column" aria-label="Kartta">
                <div className="map-options" role="group" aria-label="Karttatasot">
                  <label className="checkbox"><input type="checkbox" checked={showClubs} onChange={(event) => setShowClubs(event.target.checked)} /> Seurat</label>
                  <label className="checkbox"><input type="checkbox" checked={highlightUnassigned} onChange={(event) => setHighlightUnassigned(event.target.checked)} /> Korosta kohdistamattomat</label>
                  <label className="checkbox"><input type="checkbox" checked={showBaseMap} onChange={(event) => setShowBaseMap(event.target.checked)} /> Taustakartta</label>
                  <label className="checkbox"><input type="checkbox" checked={populationLayer} onChange={(event) => setPopulationLayer(event.target.checked)} /> Väestökartta 2025</label>
                  <span className="map-status" role="status" aria-live="polite">{filtered.length} / {placements.length} seuraa{filtersActive ? ' (suodatettu)' : ''}</span>
                </div>
                <ProvinceOverlayControls settings={provinceSettings} provinces={provinces} onChange={setProvinceSettings} />
                {provinceError && <p className="notice" role="alert">Maakuntataso ei ole käytettävissä: {provinceError}</p>}
                {editingRegion && <p className="edit-banner" role="status"><ColorDot color={editingRegion.color} /><span>Valintatila: napsauta kuntia lisätäksesi tai poistaaksesi ne alueesta <strong>{editingRegion.name}</strong>.</span></p>}
                <RegionMap dataset={dataset} provinces={provinces} provinceSettings={provinceSettings} regions={mapRegions} membership={membership} editingRegion={editingRegion} selectedRegionId={selectedRegionId} selectedMunicipalityCode={selectedMunicipality}
                  highlightCodes={unassignedCodes} matchCodes={matchCodes} aggregates={fullAggregates} placements={filtered} showClubs={showClubs} showBaseMap={showBaseMap} dark={dark}
                  populationLayer={populationLayer} onMunicipalityClick={onMunicipalityClick} onRegionSelect={selectRegion} />
                <div className="map-legend-bar" aria-label="Selite">
                  <span><i className="legend-swatch outline" /> Alueen raja</span>
                  <span><i className="legend-swatch dashed" /> Päällekkäinen alue</span>
                  {highlightUnassigned && <span><i className="legend-swatch unassigned" /> Kohdistamaton kunta</span>}
                  {showClubs && <span>{VOTING_POWERS.map((votes) => <span key={votes}><i className="legend-dot" style={{ background: markerColor(votes) }} />{votes}</span>)} ääntä · koko = jäsenmäärä</span>}
                </div>
              </section>
              <aside className="planner-panel" aria-label="Tiedot">
                {editingRegion && <RegionEditor region={editingRegion} dataset={dataset} aggregates={fullAggregates} membership={membership}
                  onChange={(changes, label, field) => updateRegion(editingRegion.id, changes, label, field)}
                  onMunicipalities={(codes, mode, label) => setMunicipalities(editingRegion.id, codes, mode, label)} onClose={() => setEditing(false)} />}
                {!editingRegion && selectedRegion && <RegionDetail region={selectedRegion} stats={analysis.stats.get(selectedRegion.id)!} explanation={explainCoverage(selectedRegion, analysis.stats.get(selectedRegion.id)!, analysis)} readOnly={!canWrite}
                  warnings={warnings.filter((warning) => warning.regionId === selectedRegion.id)} onEdit={() => setEditing(true)} onDuplicate={() => duplicateRegion(selectedRegion.id)} onClose={() => setSelectedRegionId(null)} />}
                {!editingRegion && !selectedRegion && selectedMunicipality && dataset.byCode.get(selectedMunicipality) && (
                  <MunicipalityCard municipality={dataset.byCode.get(selectedMunicipality)!} aggregate={fullAggregates.get(selectedMunicipality)} regions={[...regions].sort((a, b) => a.number - b.number)} memberOf={membership.get(selectedMunicipality) ?? []} readOnly={!canWrite}
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
          {view === 'dashboard' && <><DashboardView analysis={analysis} regions={regions} dataset={dataset} scenarioCount={document_.scenarios.length} scenarioName={scenario.name} warnings={warnings} filtered={filtersActive} onSelectRegion={selectRegion} /><CompetitionAnalytics geography={dataset.municipalities} title="Johdon kilpailuanalyysi" /></>}
          {view === 'compare' && <><ComparisonView regions={regions} analysis={analysis} onSelectRegion={selectRegion} /><ProvinceComparison rows={provinceStatistics} /><CompetitionAnalytics geography={dataset.municipalities} title="Kilpailujen vuosivertailu" /></>}
          {view === 'unassigned' && <UnassignedView analysis={analysis} regions={regions} onShowOnMap={() => { setHighlightUnassigned(true); setSelectedRegionId(null); setEditing(false); setView('map'); }}
            onAssign={(regionId, codes) => setMunicipalities(regionId, codes, 'add', `Kohdistettu ${codes.length} kuntaa`)} />}
          {view === 'scenarios' && <ScenarioManager document={displayedDocument} dataset={dataset} readOnly={!canWrite}
            onCreate={(name) => { commit('Skenaarion luonti', (current) => documentOps.addScenario(current, name)); setSelectedRegionId(null); }}
            onRename={(id, name) => commit('Skenaarion nimeäminen', (current) => documentOps.renameScenario(current, id, name))}
            onDuplicate={(id) => { commit('Skenaarion monistus', (current) => documentOps.duplicateScenario(current, id)); setSelectedRegionId(null); }}
            onDelete={(id) => void deleteScenario(id)}
            onSwitch={selectScenario} />}
          {view === 'backups' && <BackupManager backups={backups} current={displayedDocument} dataset={dataset} onCreate={() => void createManualBackup()} onRestore={(snapshot) => void onRestore(snapshot)} readOnly={!canWrite} />}
          {view === 'data' && <><DataManager onExport={onExport} onImport={onImport} knownCodes={new Set(dataset.byCode.keys())} readOnly={!canWrite} /><CompetitionAnalytics geography={dataset.municipalities} title="Raporttien kilpailutilastot" /><PopulationExplorer municipalities={dataset.municipalities} /></>}
        </main>
      )}
      <footer className="planner-footer">Kuntarajat © Tilastokeskus, kunta1000k 2025 (CC BY 4.0) · Taustakartta © OpenStreetMap · {remoteMode ? 'Suunnitelmat tallentuvat yhteisesti palvelimelle' : 'Suunnitelmat tallentuvat tähän selaimeen'} ({storageKind ?? '…'}). Tunnukset ovat yhteisiä eikä muutosten tekijää tunnisteta.</footer>
    </div>
  );
}
