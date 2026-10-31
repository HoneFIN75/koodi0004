import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, MapPin, Moon, Search, Sun, Users, Vote, type LucideIcon } from 'lucide-react';
import { clubRepository } from './data/clubRepository';
import { municipalityRepository } from './data/municipalityRepository';
import type { MunicipalityDataset } from './models/region';
import { assignClubs } from './services/regionAnalytics';
import { per10000Residents, summarizePopulation } from './services/populationService';
import { PopulationExplorer } from './components/PopulationExplorer';
import { CompetitionPanel } from './components/CompetitionPanel';
import { CompetitionLayerControl } from './components/CompetitionLayerControl';
import { useCompetitions } from './state/useCompetitions';
import { useActiveScenario } from './state/usePlanner';
import type { Club, Database, MunicipalityStat } from './models/club';
import { ChartCard } from './components/ChartCard';
import { MapView } from './components/MapView';
import { RankingCard } from './components/RankingCard';
import { ClubFilters } from './components/ClubFilters';
import { ClubDetail } from './components/ClubDetail';
import { ClubResults } from './components/ClubResults';
import { filterClubs, type ClubFilters as Filters } from './services/searchService';
import { formatCount, hasLocation } from './services/mapService';
import { getMembershipDistribution, getMunicipalityStats, getRegionalStats, getTotals, getVotingDistribution } from './services/statisticsService';

const numberFormat = new Intl.NumberFormat('fi-FI');
const emptyClubs: Club[] = [];
const initialFilters: Filters = { query: '', maxMembers: null, votes: null };

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: number | null;
  suffix: string;
}

function MetricCard({ icon: Icon, label, value, suffix }: MetricCardProps) {
  return (
    <article className="metric-card panel">
      <div className="metric-icon"><Icon size={18} /></div>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{formatCount(value)} <span>{suffix}</span></div>
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
  const [populationError, setPopulationError] = useState('');
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [attempt, setAttempt] = useState(0);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('seurakartta-theme') !== 'light');
  const plannerScenario = useActiveScenario();
  const competitions = useCompetitions(municipalities, plannerScenario.regions);

  useEffect(() => {
    let active = true;
    setPopulationError('');
    municipalityRepository.getMunicipalities().then((result) => { if (active) setMunicipalities(result); })
      .catch((cause: unknown) => { if (active) setPopulationError(cause instanceof Error ? cause.message : 'Väestötiedon kuntakohdistus epäonnistui.'); });
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
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    localStorage.setItem('seurakartta-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

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
  const municipalityCodeFor = useCallback((club: Club) => clubMunicipalities.get(club)?.code ?? null, [clubMunicipalities]);
  const sortedClubs = useMemo(() => [...filteredClubs].sort((a, b) => (b.jasenmaara ?? -1) - (a.jasenmaara ?? -1)), [filteredClubs]);
  const mappedCount = useMemo(() => filteredClubs.filter(hasLocation).length, [filteredClubs]);
  const maxMembers = useMemo(() => clubs.reduce((maximum, club) => Math.max(maximum, club.jasenmaara ?? 0), 0), [clubs]);
  const votingOptions = useMemo(() => [...new Set([10, 15, 20, ...clubs.flatMap((club) => club.aanimaara === null ? [] : [club.aanimaara])])].sort((a, b) => a - b), [clubs]);
  const totals = useMemo(() => getTotals(filteredClubs), [filteredClubs]);
  const municipalityStats = useMemo(() => getMunicipalityStats(filteredClubs), [filteredClubs]);
  const regions = useMemo(() => getRegionalStats(filteredClubs), [filteredClubs]);
  const membershipDistribution = useMemo(() => getMembershipDistribution(filteredClubs), [filteredClubs]);
  const votingDistribution = useMemo(() => getVotingDistribution(filteredClubs), [filteredClubs]);
  const onFilterChange = (next: Filters) => { setFilters(next); setSelectedClub(null); };
  const closeDetail = useCallback(() => setSelectedClub(null), []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="Seurakartta etusivu">
          <span className="brand-mark"><span /></span>
          <span>SEURA<span className="brand-light">KARTTA</span><small>SUOMEN FRISBEEGOLFSEURAT</small></span>
        </a>
        <nav className="top-nav"><a className="active" href="#kartta">Kartta</a><a href="#tilastot">Tilastot</a><a href="#/alueet"><span className="nav-long">Aluesuunnittelu</span><span className="nav-short">Alueet</span></a></nav>
        <button className="theme-toggle" onClick={() => setDarkMode((mode) => !mode)} aria-label={darkMode ? 'Vaihda vaaleaan tilaan' : 'Vaihda tummaan tilaan'}>
          {darkMode ? <Sun size={17} /> : <Moon size={17} />}<span>{darkMode ? 'Vaalea tila' : 'Tumma tila'}</span>
        </button>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="live-dot" /> SEURATOIMINNAN TILANNEKUVA</div>
          <h1>Suomen seurat,<br /><span>yhdellä kartalla.</span></h1>
          <p>Jäsenmäärät ja äänivalta näkyviin. Tutki, vertaile ja löydä seuratoiminnan koko kuva.</p>
        </div>
        <div className="hero-aside"><div className="hero-number">{database ? numberFormat.format(totals.clubs) : '—'}</div><span>seuraa mukana</span><div className="hero-line" /><small>DATA PÄIVITETTY<br />{database?.metadata.generatedAt ? new Date(database.metadata.generatedAt).toLocaleDateString('fi-FI') : 'Ei tietoa'}</small></div>
      </section>

      {error && <div className="error-banner" role="alert"><AlertCircle size={20} /><div><strong>Aineistoa ei voitu ladata</strong><span>{error}</span><button className="clear-filters" onClick={() => setAttempt((value) => value + 1)}>Yritä uudelleen</button></div></div>}
      {populationError && <p className="data-warning" role="alert">Kuntien väestöanalyysi ei ole saatavilla: {populationError} <button onClick={() => setAttempt((value) => value + 1)}>Yritä uudelleen</button></p>}
      {!database && !error && <div className="loading-state" role="status"><span className="loading-spinner" />Ladataan seuroja ja rakennetaan tilannekuvaa…</div>}
      {database && <>
      {database.warnings.length > 0 && <div className="data-warning" role="status"><AlertCircle size={20} /><div><strong>Aineiston huomautukset</strong>{database.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>}
      {clubs.length === 0 && <p className="data-warning" role="status">Tietokannassa ei ole vielä seuroja. Kartta ja tilastot päivittyvät aineiston mukana.</p>}

      <section className="metrics-grid" aria-label="Yhteenveto">
        <MetricCard icon={MapPin} label="SEUROJA" value={totals.clubs} suffix="seuraa" />
        <MetricCard icon={Users} label="JÄSENIÄ YHTEENSÄ" value={totals.members} suffix="jäsentä" />
        <MetricCard icon={Users} label="KESKIMÄÄRIN" value={totals.average} suffix="jäsentä / seura" />
        <MetricCard icon={Vote} label="MEDIAANI" value={totals.median} suffix="jäsentä / seura" />
        <ExtremeCard label="SUURIN SEURA" club={totals.largest} onSelect={setSelectedClub} />
        <ExtremeCard label="PIENIN SEURA" club={totals.smallest} onSelect={setSelectedClub} />
        <MetricCard icon={Users} label="SEURAKUNTIEN VÄESTÖ 2025" value={municipalities ? coveredPopulation.total : null} suffix="asukasta · kunnat kerran" />
        <MetricCard icon={Users} label="JÄSENIÄ / 10 000 ASUKASTA" value={municipalities ? per10000Residents(coveredMembers, coveredPopulation.total) : null} suffix="seurojen kotikunnissa" />
        <MetricCard icon={Users} label="SEUROJA / 10 000 ASUKASTA" value={municipalities ? per10000Residents(coveredClubs, coveredPopulation.total) : null} suffix="seurojen kotikunnissa" />
      </section>

      <section className="map-section panel" id="kartta">
        <div className="map-toolbar">
          <div className="map-title"><div className="section-icon"><MapPin size={18} /></div><div><h2>Seurojen sijainnit</h2><p role="status" aria-live="polite">{filteredClubs.length} / {clubs.length} seuraa · {mappedCount} kartalla</p></div></div>
          <label className="search-box"><Search size={17} /><input value={filters.query} onChange={(event) => onFilterChange({ ...filters, query: event.target.value })} placeholder="Hae seuraa tai kuntaa..." aria-label="Hae seuraa tai kuntaa" />{filters.query && <button onClick={() => onFilterChange({ ...filters, query: '' })} aria-label="Tyhjennä haku">×</button>}</label>
          <span className="filter-hint">Suodatus päivittää myös tilastot</span>
        </div>
        <ClubFilters filters={filters} maxMembers={maxMembers} votingOptions={votingOptions} onChange={onFilterChange} />
        <CompetitionLayerControl context={competitions} />
        <div className="map-layout">
          <MapView clubs={filteredClubs} allClubs={clubs} selectedClub={selectedClub} onSelect={setSelectedClub} populationFor={populationFor} municipalityCodeFor={municipalityCodeFor} competitions={competitions} />
          <div hidden={selectedClub !== null}>
            <ClubResults key={JSON.stringify(filters)} clubs={sortedClubs} selectedClub={selectedClub} onSelect={setSelectedClub} />
          </div>
          {selectedClub && <ClubDetail club={selectedClub} onClose={closeDetail} municipality={clubMunicipalities.get(selectedClub) ?? null} competitions={competitions} />}
        </div>
        {mappedCount < filteredClubs.length && <p className="empty-note">{filteredClubs.length - mappedCount} seuralta puuttuu karttasijainti. Niiden muut tiedot ovat mukana tilastoissa ja luettelossa.</p>}
      </section>
      <CompetitionPanel context={competitions} />

      <section className="analytics-section" id="tilastot">
        <div className="section-heading"><div><div className="eyebrow">DATASTA NÄKEMYKSIIN</div><h2>Seurakenttä lukuina</h2><p>Suodatettu aineisto: {totals.clubs} seuraa, {totals.municipalities} kuntaa. Jäsenmäärä tiedossa {totals.knownMembers} seuralla.</p></div><div className="section-count"><span>{numberFormat.format(totals.members)}</span> jäsentä analyysissä</div></div>
        <div className="analytics-grid">
          <RankingCard title="Suurimmat seurat" description="Tunnetun jäsenmäärän mukaan" rows={sortedClubs.flatMap((club) => club.jasenmaara === null ? [] : [{ name: club.seura, clubs: 1, members: club.jasenmaara }])} valueLabel="jäsentä" />
          <RankingCard title="Suurimmat kunnat" description="Jäseniä kunnittain" rows={municipalityStats} valueLabel="jäsentä" />
          <ChartCard title="Jäsenmäärän jakauma" description="Seuroja jäsenmäärän mukaan" rows={membershipDistribution} />
          <ChartCard title="Äänimäärän jakauma" description="Seuroja äänimäärän mukaan" rows={votingDistribution} color="var(--gold)" />
          <OverviewBars rows={municipalityStats} />
          <RankingCard title="Aluevertailu" description="Aineiston alue tai suuntaa-antava koordinaattiryhmä" rows={regions} valueLabel="jäsentä" limit={5} />
        </div>
        {municipalities && <PopulationExplorer municipalities={municipalities.municipalities} competitions={competitions} />}
      </section>
      </>}

      <footer className="footer"><div className="brand-mark small"><span /></div><span>SEURAKARTTA</span><span className="footer-source">Tietolähde: seuratietokanta{database ? ` · ${database.data.length} seuraa · metadata: ${database.metadata.recordCount ?? 'ei tietoa'}` : ''}</span><a href="https://www.openstreetmap.org/copyright">Kartta © OpenStreetMap</a></footer>
    </main>
  );
}
