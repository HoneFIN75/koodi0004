import { useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { Club } from '../models/club';
import type { Municipality, Scenario } from '../models/region';
import { formatCount } from '../services/mapService';
import { normalizeMunicipalityName, per10000Residents } from '../services/populationService';
import { SortableTableHeader } from './SortableTableHeader';
import { sortTableRows, toggleTableSort, type TableSortState } from '../services/tableSorting';

type MatrixValue = string | number | null;

interface MatrixRow {
  club: Club;
  municipality: Municipality | null;
  regions: string[];
  scenario: string;
  competitions: number | null;
}

interface MatrixColumn {
  id: string;
  label: string;
  value: (row: MatrixRow) => MatrixValue;
}

interface ClubMatrixProps {
  clubs: readonly Club[];
  municipalityByClub: ReadonlyMap<Club, Municipality | null>;
  scenarios: readonly Scenario[];
  activeScenarioId: string;
  competitionCounts: ReadonlyMap<string, number>;
  scenarioLoading: boolean;
  scenarioError: string | null;
}

const collator = new Intl.Collator('fi', { sensitivity: 'base', numeric: true });
const formatNumber = new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 1 });
const extraLabels: Record<string, string> = {
  foundedYear: 'Perustamisvuosi',
  perustamisvuosi: 'Perustamisvuosi',
  competitors: 'Kilpailijamäärä',
  competitorCount: 'Kilpailijamäärä',
  lisenssipelaajat: 'Lisenssipelaajia',
  juniorMembers: 'Juniorijäseniä',
  juniorit: 'Juniorijäseniä',
  courses: 'Ratoja',
  courseCount: 'Ratoja',
  radat: 'Ratoja',
  activity: 'Viimeisin aktiivisuus',
  coordinator: 'Aluekoordinaattori',
};

function MatrixMetric({ label, value, detail }: { label: string; value: MatrixValue; detail?: string }) {
  return <article className="matrix-metric panel">
    <span className="metric-label">{label}</span>
    <strong>{typeof value === 'number' ? formatCount(value) : value ?? '–'}</strong>
    {detail && <small>{detail}</small>}
  </article>;
}

export function ClubMatrix({
  clubs, municipalityByClub, scenarios, activeScenarioId, competitionCounts, scenarioLoading, scenarioError,
}: ClubMatrixProps) {
  const [query, setQuery] = useState('');
  const [regionId, setRegionId] = useState('');
  const [scenarioId, setScenarioId] = useState(activeScenarioId);
  const [sort, setSort] = useState<TableSortState>({ key: 'name', direction: 'asc' });
  const [regionSort, setRegionSort] = useState<TableSortState>({ key: 'name', direction: 'asc' });

  const selectedScenario = scenarios.find((scenario) => scenario.id === scenarioId)
    ?? scenarios.find((scenario) => scenario.id === activeScenarioId)
    ?? null;
  const areas = selectedScenario?.regions ?? [];

  useEffect(() => {
    if (!scenarios.some((scenario) => scenario.id === scenarioId)) setScenarioId(activeScenarioId);
  }, [activeScenarioId, scenarioId, scenarios]);

  const rows = useMemo<MatrixRow[]>(() => clubs.map((club) => {
    const municipality = municipalityByClub.get(club) ?? null;
    const regions = selectedScenario?.regions
      .filter((region) => region.enabled && municipality && region.municipalityCodes.includes(municipality.code))
      .map((region) => region.name) ?? [];
    return {
      club,
      municipality,
      regions,
      scenario: selectedScenario?.name ?? '',
      competitions: municipality
        ? competitionCounts.get(normalizeMunicipalityName(municipality.name)) ?? 0
        : null,
    };
  }), [clubs, competitionCounts, municipalityByClub, selectedScenario]);

  const extraKeys = useMemo(() => [...new Set(clubs.flatMap((club) => Object.keys(club.details)))].sort((a, b) => collator.compare(a, b)), [clubs]);
  const columns = useMemo<MatrixColumn[]>(() => [
    { id: 'name', label: 'Seuran nimi', value: ({ club }) => club.seura },
    { id: 'members', label: 'Jäsenmäärä', value: ({ club }) => club.jasenmaara },
    { id: 'votes', label: 'Äänimäärä', value: ({ club }) => club.aanimaara },
    { id: 'municipality', label: 'Kotikaupunki', value: ({ club }) => club.paikkakunta },
    { id: 'area', label: 'Alue', value: ({ regions }) => regions.length ? regions.join(', ') : 'Ei kohdistettu' },
    { id: 'scenario', label: 'Skenaario', value: ({ scenario }) => scenario || null },
    { id: 'population', label: 'Kunnan väkiluku 2025', value: ({ municipality }) => municipality?.population ?? null },
    { id: 'competitions', label: 'Kilpailuja kotikunnassa', value: ({ competitions }) => competitions },
    { id: 'per-capita', label: 'Jäseniä / 10 000 asukasta', value: ({ club, municipality }) => per10000Residents(club.jasenmaara, municipality?.population ?? null) },
    ...extraKeys.map((key) => ({
      id: `detail:${key}`,
      label: extraLabels[key] ?? key,
      value: ({ club }: MatrixRow) => club.details[key] ?? null,
    })),
  ], [extraKeys]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('fi-FI');
    const selectedRegion = areas.find((region) => region.id === regionId);
    const matching = rows.filter((row) => (!needle || row.club.seura.toLocaleLowerCase('fi-FI').includes(needle))
      && (!selectedRegion || row.regions.includes(selectedRegion.name)));
    return sortTableRows(matching, sort, (row, key) => columns.find((column) => column.id === key)?.value(row) ?? null);
  }, [areas, columns, query, regionId, rows, sort]);

  const totals = useMemo(() => filteredRows.reduce((result, row) => ({
    members: result.members + (row.club.jasenmaara ?? 0),
    votes: result.votes + (row.club.aanimaara ?? 0),
  }), { members: 0, votes: 0 }), [filteredRows]);

  const regionSummary = useMemo(() => {
    const summary = new Map(areas.map((region) => [region.id, {
      region: { id: region.id, name: region.name, number: region.number }, clubs: 0, members: 0, votes: 0,
    }]));
    let unassigned = { clubs: 0, members: 0, votes: 0 };
    for (const row of filteredRows) {
      const assigned = areas.filter((region) => region.enabled && row.municipality && region.municipalityCodes.includes(row.municipality.code));
      if (assigned.length === 0) {
        unassigned = {
          clubs: unassigned.clubs + 1,
          members: unassigned.members + (row.club.jasenmaara ?? 0),
          votes: unassigned.votes + (row.club.aanimaara ?? 0),
        };
      }
      for (const region of assigned) {
        const total = summary.get(region.id)!;
        total.clubs += 1;
        total.members += row.club.jasenmaara ?? 0;
        total.votes += row.club.aanimaara ?? 0;
      }
    }
    const result = [...summary.values()];
    if (unassigned.clubs) result.push({ region: { id: 'unassigned', name: 'Ei kohdistettu', number: Number.MAX_SAFE_INTEGER }, ...unassigned });
    return sortTableRows(result, regionSort, (row, key) => key === 'name' ? row.region.name
      : key === 'clubs' ? row.clubs
        : key === 'members' ? row.members
          : row.votes);
  }, [areas, filteredRows, regionSort]);

  const changeSort = (key: string) => setSort((current) => toggleTableSort(current, key));
  const changeRegionSort = (key: string) => setRegionSort((current) => toggleTableSort(current, key));
  const clearFilters = () => {
    setQuery('');
    setRegionId('');
    setScenarioId(activeScenarioId);
  };

  return <section className="club-matrix-section" id="seura-matriisi" aria-labelledby="club-matrix-title">
    <header className="matrix-heading">
      <div><div className="eyebrow">SEURAT YHDELLÄ SILMÄYKSELLÄ</div><h2 id="club-matrix-title">Seura matriisi</h2>
        <p>Seurojen jäsenmäärät, äänivalta ja kotikuntien tunnusluvut valitussa aluejakoskenaariossa.</p></div>
    </header>
    <div className="matrix-metrics" aria-label="Seuramatriisin yhteenveto">
      <MatrixMetric label="SEUROJA YHTEENSÄ" value={filteredRows.length} detail={`aineistossa ${clubs.length}`} />
      <MatrixMetric label="JÄSENIÄ YHTEENSÄ" value={totals.members} />
      <MatrixMetric label="ÄÄNIÄ YHTEENSÄ" value={totals.votes} />
      <MatrixMetric label="ALUEITA YHTEENSÄ" value={areas.length} detail={selectedScenario?.name ?? (scenarioLoading ? 'Ladataan skenaariota…' : 'Skenaario ei saatavilla')} />
    </div>
    {scenarioError && <p className="data-warning" role="status">Aluejakoskenaariota ei voitu ladata. Seurat näkyvät ilman aluekohdistusta. {scenarioError}</p>}
    <details className="matrix-filters panel">
      <summary><h3>Suodattimet</h3></summary>
      <div className="matrix-filter-grid">
        <label>Seuran nimi<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hae seuraa…" /></label>
        <label>Alue<select value={regionId} onChange={(event) => setRegionId(event.target.value)}>
          <option value="">Kaikki alueet</option>
          {areas.filter((region) => region.enabled).map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
        </select></label>
        <label>Skenaario<select value={selectedScenario?.id ?? ''} disabled={scenarios.length === 0} onChange={(event) => { setScenarioId(event.target.value); setRegionId(''); }}>
          {scenarios.length === 0
            ? <option value="">Ei skenaariota</option>
            : scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
        </select></label>
        {(query || regionId || scenarioId !== activeScenarioId) && <button type="button" className="text-button matrix-clear" onClick={clearFilters}><RotateCcw size={14} /> Tyhjennä suodattimet</button>}
      </div>
    </details>
    <section className="matrix-region-summary panel" aria-labelledby="matrix-region-title">
      <h3 id="matrix-region-title">Yhteenveto alueittain</h3>
      {regionSummary.length === 0
        ? <p className="empty-note">Valitussa skenaariossa ei ole alueita.</p>
        : <div className="matrix-region-table" role="region" aria-labelledby="matrix-region-title" tabIndex={0}><table>
          <thead><tr>
            <SortableTableHeader columnKey="name" label="Alue" sortKey={regionSort.key} direction={regionSort.direction} onSort={changeRegionSort} />
            <SortableTableHeader columnKey="clubs" label="Seuroja" sortKey={regionSort.key} direction={regionSort.direction} onSort={changeRegionSort} />
            <SortableTableHeader columnKey="members" label="Jäseniä" sortKey={regionSort.key} direction={regionSort.direction} onSort={changeRegionSort} />
            <SortableTableHeader columnKey="votes" label="Ääniä" sortKey={regionSort.key} direction={regionSort.direction} onSort={changeRegionSort} />
          </tr></thead>
          <tbody>{regionSummary.map(({ region, clubs: count, members, votes }) => <tr key={region.id}>
            <th scope="row">{region.name}</th><td>{formatCount(count)}</td><td>{formatCount(members)}</td><td>{formatCount(votes)}</td>
          </tr>)}</tbody>
        </table></div>}
      <p className="matrix-note">Alueiden jäsen- ja äänimäärät voivat sisältää samoja seuroja, jos kuntia on kohdistettu usealle päällekkäiselle alueelle.</p>
    </section>
    <div className="matrix-table-wrap" role="region" aria-label="Seurojen matriisitaulukko" tabIndex={0}>
      <table className="matrix-table">
        <thead><tr>{columns.map((column) => {
          return <SortableTableHeader key={column.id} columnKey={column.id} label={column.label}
            sortKey={sort.key} direction={sort.direction} onSort={changeSort} />;
        })}</tr></thead>
        <tbody>
          {filteredRows.map((row) => <tr key={row.club.id ?? `${row.club.seura}-${row.club.paikkakunta}`}>
            {columns.map((column) => {
              const value = column.value(row);
              const numeric = typeof value === 'number';
              const formatted = numeric ? formatNumber.format(value) : value ?? '–';
              return <td key={column.id} className={numeric ? 'numeric' : undefined}>{column.id === 'area' && row.regions.length === 0 ? 'Ei kohdistettu' : formatted}</td>;
            })}
          </tr>)}
          {filteredRows.length === 0 && <tr><td colSpan={columns.length} className="matrix-empty">Suodattimilla ei löytynyt seuroja.</td></tr>}
        </tbody>
      </table>
    </div>
    <p className="matrix-result-count" role="status">Näytetään {formatCount(filteredRows.length)} / {formatCount(clubs.length)} seuraa.</p>
  </section>;
}
