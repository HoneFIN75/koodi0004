import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, BarChart3, ChevronDown, MapPin, Search, Trophy, Users, Vote, type LucideIcon } from 'lucide-react';
import { SiteHeader } from './components/SiteHeader';
import { clubRepository } from './data/clubRepository';
import { municipalityRepository } from './data/municipalityRepository';
import { provinceRepository } from './data/provinceRepository.ts';
import type { MunicipalityDataset } from './models/region';
import type { ProvinceDataset } from './models/province.ts';
import { assignClubs } from './services/regionAnalytics';
import { per10000Residents, summarizePopulation } from './services/populationService';
import { getProvinceCoverageIssues, getProvinceStatistics } from './services/provinceAnalytics.ts';
import { useProvinceSettings } from './hooks/useProvinceSettings.ts';
import { PopulationExplorer } from './components/PopulationExplorer';
import { ProvinceComparison } from './components/ProvinceComparison.tsx';
import { CompetitionFilters } from './components/CompetitionFilters';
import { ClubMatrix } from './components/ClubMatrix';
import type { Club, Database, MunicipalityStat } from './models/club';
import { ChartCard } from './components/ChartCard';
import { describeCompetitionYears } from './services/competitionService';
import { MapView } from './components/MapView';
import { RankingCard } from './components/RankingCard';
import { ClubFilters } from './components/ClubFilters';
import { ClubDetail } from './components/ClubDetail';
import { ClubResults } from './components/ClubResults';
import { filterClubs, type ClubFilters as Filters } from './services/searchService';
import { formatCount, hasLocation } from './services/mapService';
import { getMembershipDistribution, getMunicipalityStats, getTotals, getVotesByMembershipBand } from './services/statisticsService';
import { VOTING_POWERS } from './services/membershipRules.ts';
import { useCompetitionData, useCompetitionStatistics } from './state/useCompetitions.ts';
import { plannerStore } from './state/plannerStore';
import { usePlanner } from './state/usePlanner';

const numberFormat = new Intl.NumberFormat('fi-FI');
const emptyClubs: Club[] = [];
const emptyMunicipalities: NonNullable<MunicipalityDataset['municipalities']> = [];
const initialFilters: Filters = { query: '', minMembers: null, maxMembers: null, votes: null };
const MAP_LAYER_PREFERENCES_KEY = 'seurakartta-map-layers';

function readShowCompetitionLayer() {
  try {
    const stored = localStorage.getItem(MAP_LAYER_PREFERENCES_KEY);
    if (!stored) return false;
    const value: unknown = JSON.parse(stored);
    return typeof value === 'object' && value !== null && 'showCompetitions' in value
      && typeof value.showCompetitions === 'boolean' ? value.showCompetitions : false;
  } catch {
    return false;
  }
}

function describeCompetitionPeriod(years: readonly number[]) {
  if (years.length === 0) return 'ei tietoja';
  const first = years[0];
  const last = years[years.length - 1];
  return last - first + 1 === years.length ? `${first}–${last}` : years.join(', ');
}

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: number | null;
  suffix: string;
  testId?: string;
}

function MetricCard({ icon: Icon, label, value, suffix, testId }: MetricCardProps) {
  return (
    <article className="metric-card panel">
      <div className="metric-icon"><Icon size={18} /></div>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{testId ? <strong data-testid={testId}>{formatCount(value)}</strong> : formatCount(value)} <span>{suffix}</span></div>
    </article>
  );
}

function ExtremeCard({ label, club, onSelect }: { label: string; club: Club | null; onSelect: (club: Club) => void }) {
  return (
    <article className="metric-card panel extreme-card">
      <div className="metric-icon"><Users size={18} /></div>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{formatCount(club?.jasenmaara ?? null)} <span>jäsentä</span></div>
      {club ? <button onClick={() => onSelect(club)}>{club.seura}</button> : <p className="empty-note">Ei jäsenmäärätietoja.</p>}
    </article>
  );
}

function OverviewBars({ rows }: { rows: MunicipalityStat[] }) {
  const maximum = Math.max(...rows.map((row) => row.members), 1);
  return (
    <section className="panel overview-card">
      <div className="panel-heading">
        <div><h3>Seurat kunnittain</h3><p>Eniten jäseniä kunnittain</p></div>
        <MapPin size={17} className="muted-icon" />
      </div>
      <div className="overview-list">
        {rows.slice(0, 7).map((row) => (
          <div className="overview-row" key={row.name}>
            <span>{row.name}</span>
            <div className="bar-track"><span style={{ width: `${(row.members / maximum) * 100}%` }} /></div>
            <strong>{numberFormat.format(row.members)}</strong>
          </div>
        ))}
        {rows.length === 0 && <p className="empty-note">Ei tilastoitavaa aineistoa.</p>}
      </div>
    </section>
  );
}

export default function App() {
  const [database, setDatabase] = useState<Database | null>(null);
  const [municipalities, setMunicipalities] = useState<MunicipalityDataset | null>(null);
  const [provinces, setProvinces] = useState<ProvinceDataset | null>(null);
  const [provinceError, setProvinceError] = useState('');
  const [populationError, setPopulationError] = useState('');
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [attempt, setAttempt] = useState(0);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [provinceSettings, setProvinceSettings] = useProvinceSettings();
  const [showCompetitions, setShowCompetitions] = useState(readShowCompetitionLayer);
  const { index: competitionIndex, yearFilter: competitionYearFilter } = useCompetitionData();
  const competitionStatistics = useCompetitionStatistics({}, municipalities?.municipalities ?? emptyMunicipalities);
  const scenarios = usePlanner((state) => state.history.present.scenarios);
  const activeScenarioId = usePlanner((state) => state.history.present.activeScenarioId);
  const scenarioReady = usePlanner((state) => state.ready);
  const scenarioError = usePlanner((state) => state.loadError);

  useEffect(() => {
    void plannerStore.getState().init();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(MAP_LAYER_PREFERENCES_KEY, JSON.stringify({ showCompetitions }));
    } catch {
      // The layer remains usable for this session if browser storage is unavailable.
    }
  }, [showCompetitions]);

  useEffect(() => {
    let active = true;
    setPopulationError('');
    municipalityRepository.getMunicipalities().then((result) => { if (active) setMunicipalities(result); })
      .catch((cause: unknown) => { if (active) setPopulationError(cause instanceof Error ? cause.message : 'Väestötiedon kuntakohdistus epäonnistui.'); });
    provinceRepository.getProvinces().then((result) => { if (active) { setProvinces(result); setProvinceError(''); } })
      .catch((cause: unknown) => { if (active) setProvinceError(cause instanceof Error ? cause.message : 'Maakuntatietojen lataus epäonnistui.'); });
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => {
    let active = true;
    setError('');
    clubRepository.getDatabase().then((result) => {
      if (active) setDatabase(result);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Seuratietokannan lataus epäonnistui.');
    });
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => {
    if (!database) return;
    const id = window.location.hash.slice(1);
    if (!['kartta', 'tilastot', 'seura-matriisi'].includes(id)) return;
    const frame = window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
    return () => window.cancelAnimationFrame(frame);
  }, [database]);

  const clubs = database?.data ?? emptyClubs;
  const clubMunicipalities = useMemo(() => new Map(municipalities ? assignClubs(clubs, municipalities).map(({ club, municipalityCode }) => [club, municipalityCode ? municipalities.byCode.get(municipalityCode) ?? null : null]) : []), [clubs, municipalities]);
  const filteredClubs = useMemo(() => filterClubs(clubs, filters, (club) => clubMunicipalities.get(club)?.population ?? null), [clubs, filters, clubMunicipalities]);
  const coveredPopulation = useMemo(() => summarizePopulation(filteredClubs.flatMap((club) => {
    const municipality = clubMunicipalities.get(club);
    return municipality ? [municipality] : [];
  })), [filteredClubs, clubMunicipalities]);
  const coveredMembers = useMemo(() => filteredClubs.reduce((sum, club) => sum + (clubMunicipalities.get(club) ? club.jasenmaara ?? 0 : 0), 0), [filteredClubs, clubMunicipalities]);
  const coveredClubs = useMemo(() => filteredClubs.filter((club) => Boolean(clubMunicipalities.get(club))).length, [filteredClubs, clubMunicipalities]);
  const populationFor = useCallback((club: Club) => clubMunicipalities.get(club)?.population ?? null, [clubMunicipalities]);
  const sortedClubs = useMemo(() => [...filteredClubs].sort((a, b) => (b.jasenmaara ?? -1) - (a.jasenmaara ?? -1)), [filteredClubs]);
  const mappedCount = useMemo(() => filteredClubs.filter(hasLocation).length, [filteredClubs]);
  const maxMembers = useMemo(() => clubs.reduce((maximum, club) => Math.max(maximum, club.jasenmaara ?? 0), 0), [clubs]);
  const votingOptions = VOTING_POWERS;
  const totals = useMemo(() => getTotals(filteredClubs), [filteredClubs]);
  const municipalityStats = useMemo(() => getMunicipalityStats(filteredClubs), [filteredClubs]);
  const provinceStatistics = useMemo(() => provinces && municipalities
    ? getProvinceStatistics(provinces, municipalities, filteredClubs,
      new Map([...clubMunicipalities].map(([club, municipality]) => [club, municipality?.code ?? null])), null)
    : [], [provinces, municipalities, filteredClubs, clubMunicipalities]);
  const provinceCoverageIssues = useMemo(() => provinces && municipalities
    ? getProvinceCoverageIssues(provinces, municipalities) : [], [provinces, municipalities]);
  const membershipDistribution = useMemo(() => getMembershipDistribution(filteredClubs), [filteredClubs]);
  const votesByMembershipBand = useMemo(() => getVotesByMembershipBand(filteredClubs), [filteredClubs]);
  const onFilterChange = (next: Filters) => { setFilters(next); setSelectedClub(null); };
  const closeDetail = useCallback(() => setSelectedClub(null), []);

  return (
    <main className="app-shell">
      <SiteHeader />

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="live-dot" /> SEURATOIMINNAN TILANNEKUVA</div>
          <h1>Suomen seurat,<br /><span>yhdellä kartalla.</span></h1>
          <p>Jäsenmäärät ja äänivalta näkyviin. Tutki, vertaile ja löydä seuratoiminnan koko kuva.</p>
        </div>
        <div className="hero-aside"><div className="hero-number">{database ? numberFormat.format(totals.clubs) : '—'}</div><span>seuraa mukana</span><div className="hero-line" /><small>DATA PÄIVITETTY<br />{database?.metadata.lastUpdatedAt ? new Date(database.metadata.lastUpdatedAt).toLocaleDateString('fi-FI') : 'Ei tietoa'}</small></div>
      </section>

      {error && <div className="error-banner" role="alert"><AlertCircle size={20} /><div><strong>Aineistoa ei voitu ladata</strong><span>{error}</span><button className="clear-filters" onClick={() => setAttempt((value) => value + 1)}>Yritä uudelleen</button></div></div>}
      {populationError && <p className="data-warning" role="alert">Kuntien väestöanalyysi ei ole saatavilla: {populationError} <button onClick={() => setAttempt((value) => value + 1)}>Yritä uudelleen</button></p>}
      {provinceError && <p className="data-warning" role="alert">Maakuntatietoja ei voitu ladata: {provinceError} <button onClick={() => setAttempt((value) => value + 1)}>Yritä uudelleen</button></p>}
      {provinceCoverageIssues.length > 0 && <p className="data-warning" role="status">{provinceCoverageIssues.join(' ')}</p>}
      {!database && !error && <div className="loading-state" role="status"><span className="loading-spinner" />Ladataan seuroja ja rakennetaan tilannekuvaa…</div>}
      {database && <>
      {database.warnings.length > 0 && <div className="data-warning" role="status"><AlertCircle size={20} /><div><strong>Aineiston huomautukset</strong>{database.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>}
      {clubs.length === 0 && <p className="data-warning" role="status">Tietokannassa ei ole vielä seuroja. Kartta ja tilastot päivittyvät aineiston mukana.</p>}

      <div className="dashboard-metric-sections">
        <section className="dashboard-metric-section panel" aria-label="Seurat">
          <h2>Seurat</h2>
          <div className="dashboard-metrics-grid">
            <MetricCard icon={MapPin} label="SEUROJA" value={totals.clubs} suffix="seuraa" />
            <ExtremeCard label="SUURIN SEURA" club={totals.largest} onSelect={setSelectedClub} />
            <ExtremeCard label="PIENIN SEURA" club={totals.smallest} onSelect={setSelectedClub} />
          </div>
        </section>
        <section className="dashboard-metric-section panel" aria-label="Jäsenmäärät">
          <h2>Jäsenmäärät</h2>
          <div className="dashboard-metrics-grid">
            <MetricCard icon={Users} label="JÄSENIÄ YHTEENSÄ" value={totals.members} suffix="jäsentä" />
            <MetricCard icon={Users} label="KESKIMÄÄRIN" value={totals.average} suffix="jäsentä / seura" />
            <MetricCard icon={Vote} label="MEDIAANI" value={totals.median} suffix="jäsentä / seura" />
          </div>
        </section>
        <section className="dashboard-metric-section panel" aria-label="Seurojen kotikunnat">
          <h2>Seurojen kotikunnat</h2>
          <div className="dashboard-metrics-grid">
            <MetricCard icon={Users} label="SEURAKUNTIEN VÄESTÖ 2025" value={municipalities ? coveredPopulation.total : null} suffix="asukasta · kunnat kerran" />
            <MetricCard icon={Users} label="JÄSENIÄ / 10 000 ASUKASTA" value={municipalities ? per10000Residents(coveredMembers, coveredPopulation.total) : null} suffix="seurojen kotikunnissa" />
            <MetricCard icon={Users} label="SEUROJA / 10 000 ASUKASTA" value={municipalities ? per10000Residents(coveredClubs, coveredPopulation.total) : null} suffix="seurojen kotikunnissa" />
          </div>
        </section>
      </div>
      </>}

      <section className="dashboard-competition-metrics panel" aria-label="Kilpailujen avainluvut">
        <p className="dashboard-competition-scope" role="status">Avainluvut · {describeCompetitionYears(competitionYearFilter)}</p>
        {!competitionStatistics && <p role="status">Ladataan kilpailutilastoja…</p>}
        {competitionStatistics && <div className="dashboard-metrics-grid">
          <MetricCard icon={Trophy} label="KILPAILURIVEJÄ" value={competitionStatistics.total} suffix="riviä" testId="competition-total" />
          <MetricCard icon={MapPin} label="KILPAILUKUNTIA" value={competitionStatistics.municipalityCount} suffix={competitionStatistics.municipalityCount === 1 ? 'kunta' : 'kuntaa'} />
          <MetricCard icon={BarChart3} label="RIVEJÄ / AKTIIVINEN KUNTA" value={competitionStatistics.averagePerMunicipality} suffix="riviä / kunta" />
        </div>}
      </section>

      <details className="dashboard-map-controls panel">
        <summary>
          <span className="dashboard-map-controls-icon"><MapPin size={19} /></span>
          <span className="dashboard-map-controls-copy">
            <strong>Seurojen kartta ja kilpailut</strong>
            <span>{database ? `${filteredClubs.length} / ${clubs.length} seuraa` : error ? 'Seuratietoja ei saatavilla' : 'Ladataan seuradataa…'} · Kilpailuvuodet: {describeCompetitionYears(competitionYearFilter)}</span>
          </span>
          <ChevronDown size={20} className="dashboard-map-controls-chevron" aria-hidden="true" />
        </summary>
        <div className="dashboard-map-controls-content">
          <section className="dashboard-competition-overview" aria-label="Kilpailujen yhteenveto">
            <div className="dashboard-competition-heading">
              <div><h2>Kilpailut</h2><p>Aineistovuodet {describeCompetitionPeriod(competitionIndex?.years ?? [])}</p></div>
              <CompetitionFilters compact />
            </div>
          </section>
          <div className="dashboard-map-filter-section">
            <div className="map-toolbar">
              <div className="map-title"><div className="section-icon"><MapPin size={18} /></div><div><h2>Seurojen sijainnit</h2><p role="status" aria-live="polite">{filteredClubs.length} / {clubs.length} seuraa · {mappedCount} kartalla</p></div></div>
              <label className="search-box"><Search size={17} /><input value={filters.query} onChange={(event) => onFilterChange({ ...filters, query: event.target.value })} placeholder="Hae seuraa tai kuntaa..." aria-label="Hae seuraa tai kuntaa" />{filters.query && <button onClick={() => onFilterChange({ ...filters, query: '' })} aria-label="Tyhjennä haku">×</button>}</label>
              <span className="filter-hint">Suodatus päivittää myös tilastot</span>
            </div>
            <ClubFilters filters={filters} maxMembers={maxMembers} votingOptions={votingOptions} onChange={onFilterChange} />
            <div className="dashboard-map-layer-options" role="group" aria-label="Karttatasot">
              <label><input type="checkbox" checked={showCompetitions} onChange={(event) => setShowCompetitions(event.target.checked)} /> Kilpailumäärät kunnittain</label>
              <span>Väritys laskee aineistorivit valittuina vuosina.</span>
            </div>
          </div>
        </div>
      </details>

      {database && <>
      <section className="map-section panel" id="kartta" aria-label="Seurojen sijainnit kartalla">
        <div className="map-layout">
          <MapView clubs={filteredClubs} allClubs={clubs} selectedClub={selectedClub} onSelect={setSelectedClub} populationFor={populationFor}
            municipalities={municipalities} provinces={provinces} provinceSettings={provinceSettings} onProvinceSettingsChange={setProvinceSettings} showCompetitions={showCompetitions} />
          <div hidden={selectedClub !== null}>
            <ClubResults key={JSON.stringify(filters)} clubs={sortedClubs} selectedClub={selectedClub} onSelect={setSelectedClub} />
          </div>
          {selectedClub && <ClubDetail club={selectedClub} onClose={closeDetail} municipality={clubMunicipalities.get(selectedClub) ?? null} />}
        </div>
        {mappedCount < filteredClubs.length && <p className="empty-note">{filteredClubs.length - mappedCount} seuralta puuttuu karttasijainti. Niiden muut tiedot ovat mukana tilastoissa ja luettelossa.</p>}
      </section>

      <section className="analytics-section" id="tilastot">
        <div className="section-heading"><div><div className="eyebrow">DATASTA NÄKEMYKSIIN</div><h2>Seurakenttä lukuina</h2><p>Suodatettu aineisto: {totals.clubs} seuraa, {totals.municipalities} kuntaa. Jäsenmäärä tiedossa {totals.knownMembers} seuralla.</p></div><div className="section-count"><span>{numberFormat.format(totals.members)}</span> jäsentä analyysissä</div></div>
        <div className="analytics-grid">
          <RankingCard title="Suurimmat seurat" description="Tunnetun jäsenmäärän mukaan" rows={sortedClubs.flatMap((club) => club.jasenmaara === null ? [] : [{ name: club.seura, clubs: 1, members: club.jasenmaara }])} valueLabel="jäsentä" showClubCount={false} />
          <RankingCard title="Suurimmat kunnat" description="Jäseniä kunnittain" rows={municipalityStats} valueLabel="jäsentä" />
          <ChartCard title="Jäsenmäärän jakauma" description="Jäsenmäärä äänivaltaluokittain" rows={membershipDistribution} />
          <ChartCard title="Äänimäärä jäsenmääräluokittain" description="Äänet yhteensä kunkin jäsenmääräluokan seuroilta" rows={votesByMembershipBand} showClubCount />
          <OverviewBars rows={municipalityStats} />
          <ProvinceComparison rows={provinceStatistics} />
        </div>
        {municipalities && <PopulationExplorer municipalities={municipalities.municipalities} />}
      </section>
      <ClubMatrix
        clubs={clubs}
        municipalityByClub={clubMunicipalities}
        scenarios={scenarios}
        activeScenarioId={activeScenarioId}
        scenarioLoading={!scenarioReady}
        scenarioError={scenarioError}
      />
      </>}

      <footer className="footer"><div className="brand-mark small"><span /></div><span>SEURAKARTTA</span><span className="footer-source">Tietolähde: seuratietokanta{database ? ` · ${database.data.length} seuraa · metadata: ${database.metadata.recordCount ?? 'ei tietoa'}` : ''}</span><a href="https://www.openstreetmap.org/copyright">Kartta © OpenStreetMap</a></footer>
    </main>
  );
}
