import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, MapPin, Moon, Search, Sun, Users, Vote, type LucideIcon } from 'lucide-react';
import { clubRepository } from './data/clubRepository';
import type { Club, Database, MunicipalityStat } from './models/club';
import { ChartCard } from './components/ChartCard';
import { MapView } from './components/MapView';
import { RankingCard } from './components/RankingCard';
import { searchClubs } from './services/searchService';
import { getMembershipDistribution, getMunicipalityStats, getRegionalStats, getTotals, getVotingDistribution } from './services/statisticsService';

const numberFormat = new Intl.NumberFormat('fi-FI');

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: number;
  suffix: string;
}

function MetricCard({ icon: Icon, label, value, suffix }: MetricCardProps) {
  return (
    <article className="metric-card panel">
      <div className="metric-icon"><Icon size={18} /></div>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{numberFormat.format(value)} <span>{suffix}</span></div>
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
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('seurakartta-theme') !== 'light');

  useEffect(() => {
    clubRepository.getDatabase().then(setDatabase).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'Seuratietokannan lataus epäonnistui.');
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    localStorage.setItem('seurakartta-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const clubs = database?.data ?? [];
  const filteredClubs = useMemo(() => searchClubs(clubs, query), [clubs, query]);
  const totals = useMemo(() => getTotals(clubs), [clubs]);
  const municipalityStats = useMemo(() => getMunicipalityStats(clubs), [clubs]);
  const regions = useMemo(() => getRegionalStats(clubs), [clubs]);
  const membershipDistribution = useMemo(() => getMembershipDistribution(clubs), [clubs]);
  const votingDistribution = useMemo(() => getVotingDistribution(clubs), [clubs]);
  const closeSearch = () => { setQuery(''); setSelectedClub(null); };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Seurakartta etusivu">
          <span className="brand-mark"><span /></span>
          <span>SEURA<span className="brand-light">KARTTA</span><small>SUOMEN FRISBEEGOLFSEURAT</small></span>
        </a>
        <nav className="top-nav"><a className="active" href="#kartta">Kartta</a><a href="#tilastot">Tilastot</a></nav>
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
        <div className="hero-aside"><div className="hero-number">{numberFormat.format(totals.clubs)}</div><span>seuraa mukana</span><div className="hero-line" /><small>DATA PÄIVITETTY<br />{database ? new Date(database.metadata.generatedAt).toLocaleDateString('fi-FI') : '—'}</small></div>
      </section>

      {error && <div className="error-banner" role="alert"><AlertCircle size={20} /><div><strong>Aineistoa ei voitu ladata</strong><span>{error}</span></div></div>}

      <section className="metrics-grid" aria-label="Yhteenveto">
        <MetricCard icon={MapPin} label="SEUROJA" value={totals.clubs} suffix="seuraa" />
        <MetricCard icon={Users} label="JÄSENIÄ YHTEENSÄ" value={totals.members} suffix="jäsentä" />
        <MetricCard icon={Users} label="KESKIMÄÄRIN" value={totals.average} suffix="jäsentä / seura" />
        <MetricCard icon={Vote} label="KUNTIA" value={totals.municipalities} suffix="kuntaa" />
      </section>

      <section className="map-section panel" id="kartta">
        <div className="map-toolbar">
          <div className="map-title"><div className="section-icon"><MapPin size={18} /></div><div><h2>Seurojen sijainnit</h2><p>{filteredClubs.length} / {clubs.length} seuraa kartalla</p></div></div>
          <label className="search-box"><Search size={17} /><input value={query} onChange={(event) => { setQuery(event.target.value); setSelectedClub(null); }} placeholder="Hae seuraa tai kuntaa..." aria-label="Hae seuraa tai kuntaa" />{query && <button onClick={closeSearch} aria-label="Tyhjennä haku">×</button>}</label>
          <div className="map-legend"><span><i className="legend-dot green" />10 ääntä</span><span><i className="legend-dot yellow" />15 ääntä</span><span><i className="legend-dot coral" />20 ääntä</span></div>
        </div>
        <div className="map-layout">
          <MapView clubs={filteredClubs} selectedClub={selectedClub} />
          <aside className="club-results">
            <div className="results-heading"><strong>{query ? 'HAKUTULOKSET' : 'SUURIMMAT SEURAT'}</strong><span>{filteredClubs.length}</span></div>
            {filteredClubs.length === 0 ? <p className="empty-note">Ei hakutuloksia. Kokeile toista hakusanaa.</p> :
              [...filteredClubs].sort((a, b) => b.jasenmaara - a.jasenmaara).slice(0, query ? 12 : 5).map((club, index) => (
                <button className={`club-result ${selectedClub === club ? 'selected' : ''}`} key={`${club.seura}-${club.paikkakunta}-${index}`} onClick={() => setSelectedClub(club)}>
                  <span className="club-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="club-name"><strong>{club.seura}</strong><small>{club.paikkakunta}</small></span>
                  <span className="club-members">{numberFormat.format(club.jasenmaara)}<small>jäsentä</small></span>
                </button>
              ))}
            {!query && filteredClubs.length > 5 && <button className="show-all" onClick={() => document.querySelector<HTMLInputElement>('.search-box input')?.focus()}>Hae kaikkia seuroja <span>→</span></button>}
          </aside>
        </div>
      </section>

      <section className="analytics-section" id="tilastot">
        <div className="section-heading"><div><div className="eyebrow">DATASTA NÄKEMYKSIIN</div><h2>Seurakenttä lukuina</h2><p>Vertaa jäsenmääriä, äänivaltaa ja alueellisia eroja.</p></div><div className="section-count"><span>{numberFormat.format(totals.members)}</span> jäsentä analyysissä</div></div>
        <div className="analytics-grid">
          <RankingCard title="Suurimmat seurat" description="Jäsenmäärän mukaan" rows={clubs.map((club) => ({ name: club.seura, clubs: 1, members: club.jasenmaara })).sort((a, b) => b.members - a.members)} valueLabel="jäsentä" />
          <RankingCard title="Suurimmat kunnat" description="Jäseniä kunnittain" rows={municipalityStats} valueLabel="jäsentä" />
          <ChartCard title="Jäsenmäärän jakauma" description="Seuroja jäsenmäärän mukaan" rows={membershipDistribution} />
          <ChartCard title="Äänimäärän jakauma" description="Seuroja äänimäärän mukaan" rows={votingDistribution} color="var(--gold)" />
          <OverviewBars rows={municipalityStats} />
          <RankingCard title="Aluevertailu" description="Suuntaa-antava vertailu sijainnin mukaan" rows={regions} valueLabel="jäsentä" limit={5} />
        </div>
      </section>

      <footer className="footer"><div className="brand-mark small"><span /></div><span>SEURAKARTTA</span><span className="footer-source">Tietolähde: seuratietokanta{database ? ` · ${database.metadata.recordCount} tietuetta` : ''}</span><a href="https://www.openstreetmap.org/copyright">Kartta © OpenStreetMap</a></footer>
    </main>
  );
}
