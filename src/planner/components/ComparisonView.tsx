import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { Region } from '../../models/region';
import { formatArea, formatPercent, type RegionStats, type ScenarioAnalysis } from '../../services/regionAnalytics';
import { BarChart, StatCard, decimalFormat, integerFormat } from './ui';
import { formatCount } from '../../services/mapService';
import { summarizePopulation } from '../../services/populationService';
import { per10000Residents } from '../../services/populationService';
import type { CompetitionContext } from '../../state/useCompetitions';
import { CompetitionScope } from '../../components/CompetitionScope';

type MetricKey = 'areaKm2' | 'municipalityCount' | 'clubCount' | 'members' | 'votes' | 'areaShare' | 'membersPerKm2' | 'population' | 'populationShare' | 'averagePopulation' | 'medianPopulation' | 'clubsPer10000' | 'membersPer10000' | 'populationDensity';
const METRICS: { key: MetricKey; label: string; format: (stats: RegionStats) => string }[] = [
  { key: 'areaKm2', label: 'Pinta-ala', format: (stats) => formatArea(stats.areaKm2) },
  { key: 'areaShare', label: 'Kattavuus %', format: (stats) => formatPercent(stats.areaShare) },
  { key: 'municipalityCount', label: 'Kuntia', format: (stats) => String(stats.municipalityCount) },
  { key: 'clubCount', label: 'Seuroja', format: (stats) => String(stats.clubCount) },
  { key: 'members', label: 'Jäseniä', format: (stats) => integerFormat.format(stats.members) },
  { key: 'votes', label: 'Äänimäärä', format: (stats) => integerFormat.format(stats.votes) },
  { key: 'membersPerKm2', label: 'Jäseniä / 1 000 km²', format: (stats) => decimalFormat.format(stats.membersPerKm2 * 1000) },
  { key: 'population', label: 'Väestö 2025', format: (stats) => formatCount(stats.population) },
  { key: 'populationShare', label: 'Osuus Suomen väestöstä', format: (stats) => stats.populationShare === null ? 'Ei tietoa' : formatPercent(stats.populationShare) },
  { key: 'averagePopulation', label: 'Kuntaväestön keskiarvo', format: (stats) => formatCount(stats.averagePopulation) },
  { key: 'medianPopulation', label: 'Kuntaväestön mediaani', format: (stats) => formatCount(stats.medianPopulation) },
  { key: 'clubsPer10000', label: 'Seuroja / 10 000 asukasta', format: (stats) => formatCount(stats.clubsPer10000) },
  { key: 'membersPer10000', label: 'Jäseniä / 10 000 asukasta', format: (stats) => formatCount(stats.membersPer10000) },
  { key: 'populationDensity', label: 'Asukkaita / km²', format: (stats) => formatCount(stats.populationDensity) },
];

export function ComparisonView({ regions, analysis, onSelectRegion, competitions }: { regions: Region[]; analysis: ScenarioAnalysis; onSelectRegion: (id: string) => void; competitions: CompetitionContext }) {
  const sortedRegions = useMemo(() => [...regions].sort((a, b) => a.number - b.number), [regions]);
  const [chosen, setChosen] = useState<string[] | null>(null);
  const selectedIds = chosen ?? sortedRegions.filter((region) => region.enabled).map((region) => region.id);
  const [sort, setSort] = useState<{ key: MetricKey | 'number'; direction: 1 | -1 }>({ key: 'number', direction: 1 });
  const [chartMetric, setChartMetric] = useState<MetricKey>('members');

  const rows = sortedRegions.filter((region) => selectedIds.includes(region.id)).map((region) => ({ region, stats: analysis.stats.get(region.id)! }))
    .sort((a, b) => {
      if (sort.key === 'number') return sort.direction * (a.region.number - b.region.number);
      const left = a.stats[sort.key]; const right = b.stats[sort.key];
      if (left === null) return right === null ? 0 : 1;
      if (right === null) return -1;
      return sort.direction * (left - right);
    });
  const total = (key: MetricKey) => rows.reduce((sum, row) => sum + (row.stats[key] ?? 0), 0);
  const population = summarizePopulation(rows.flatMap((row) => row.stats.municipalities)).total;
  const toggle = (id: string) => setChosen(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
  const headerButton = (key: MetricKey | 'number', label: string) => (
    <button type="button" className="sort-button" onClick={() => setSort((current) => ({ key, direction: current.key === key ? (current.direction === 1 ? -1 : 1) : -1 }))}>
      {label}{sort.key === key && (sort.direction === 1 ? <ArrowUp size={12} aria-label="nouseva" /> : <ArrowDown size={12} aria-label="laskeva" />)}
    </button>
  );
  const metric = METRICS.find((item) => item.key === chartMetric)!;

  return (
    <div className="view-stack">
      <header className="view-header"><div><p className="eyebrow">ALUEVERTAILU</p><h2>Vertaile alueita</h2><p>Valitse vertailtavat alueet. Oletuksena mukana ovat kaikki käytössä olevat alueet.</p></div></header>
      <section className="planner-card">
        <div className="chip-toggle-list" role="group" aria-label="Vertailtavat alueet">
          {sortedRegions.map((region) => (
            <button key={region.id} type="button" className="chip-toggle" aria-pressed={selectedIds.includes(region.id)} onClick={() => toggle(region.id)} style={{ '--chip-color': region.color } as CSSProperties}>{region.number} {region.name}</button>
          ))}
          {sortedRegions.length === 0 && <p className="empty-text">Skenaariossa ei ole alueita.</p>}
        </div>
      </section>
      <div className="stat-grid">
        <StatCard label="Vertailualueiden väestö 2025" value={rows.some((row) => row.stats.population === null) ? 'Ei tietoa' : formatCount(population)} detail="päällekkäiset kunnat vain kerran" />
        <StatCard label="Vertailussa" value={`${rows.length} aluetta`} />
        <StatCard label="Pinta-ala yhteensä" value={formatArea(total('areaKm2'))} detail="päällekkäisyydet lasketaan kumpaankin" />
        <StatCard label="Seuroja yhteensä" value={integerFormat.format(total('clubCount'))} />
        <StatCard label="Jäseniä yhteensä" value={integerFormat.format(total('members'))} detail={rows.length ? `keskimäärin ${integerFormat.format(total('members') / rows.length)} / alue` : undefined} />
        <StatCard label="Äänimäärä yhteensä" value={integerFormat.format(total('votes'))} detail={rows.length ? `keskimäärin ${integerFormat.format(total('votes') / rows.length)} / alue` : undefined} />
      </div>
      <CompetitionScope context={competitions} codes={rows.flatMap(({ region }) => region.municipalityCodes)} title="Vertailualueiden yhdiste" />
      <section className="planner-card table-card">
        <table className="data-table">
          <caption className="sr-only">Aluevertailu</caption>
          <thead><tr>
            <th scope="col">{headerButton('number', 'Alue')}</th>
            {METRICS.map((item) => <th key={item.key} scope="col" className="numeric">{headerButton(item.key, item.label)}</th>)}
            <th scope="col">Ensisijaiset kilpailut · suodatettu</th><th scope="col">Liittyvät kilpailut · suodatettu</th><th scope="col">Ensisijaiset kilpailut / 10 000 asukasta</th>
          </tr></thead>
          <tbody>
            {rows.map(({ region, stats }) => (
              <tr key={region.id}>
                <th scope="row"><button type="button" className="link-button" onClick={() => onSelectRegion(region.id)}><span className="region-number small" style={{ background: region.color }}>{region.number}</span> {region.name}</button></th>
                {METRICS.map((item) => <td key={item.key} className="numeric">{item.format(stats)}</td>)}
                <td>{competitions.filters.visibility === 'hidden' ? 'Piilotettu' : competitions.analysis?.regionCounts.get(region.id) ?? 0}</td><td>{competitions.filters.visibility === 'hidden' ? 'Piilotettu' : competitions.analysis?.regionCoverageCounts.get(region.id) ?? 0}</td><td>{competitions.filters.visibility === 'hidden' ? 'Piilotettu' : formatCount(per10000Residents(competitions.analysis?.regionCounts.get(region.id) ?? 0, stats.population))}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={METRICS.length + 4} className="empty-text">Valitse vähintään yksi alue.</td></tr>}
          </tbody>
        </table>
      </section>
      {competitions.filters.visibility !== 'hidden' && <section className="planner-card"><BarChart title="Vertailualueiden ensisijaiset kilpailut · suodatettu" rows={rows.map(({ region }) => ({ id: region.id, label: region.name, value: competitions.analysis?.regionCounts.get(region.id) ?? 0, color: region.color })).sort((a, b) => b.value - a.value)} /></section>}
      <section className="planner-card">
        <label className="field inline">Kaavion mittari
          <select value={chartMetric} onChange={(event) => setChartMetric(event.target.value as MetricKey)}>{METRICS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
        </label>
        <BarChart title={metric.label} rows={[...rows].filter((row) => row.stats[chartMetric] !== null).sort((a, b) => (b.stats[chartMetric] ?? 0) - (a.stats[chartMetric] ?? 0)).map(({ region, stats }) => ({ id: region.id, label: `${region.number} ${region.shortName}`, value: stats[chartMetric] ?? 0, color: region.color, display: metric.format(stats) }))} />
      </section>
      <section className="planner-card">
        <h2 className="card-title">Pinta-alaosuus vs. jäsenosuus</h2>
        <p className="hint">Suuri ero osuuksien välillä kertoo maantieteellisesti laajasta mutta harvaan jäsenistetystä alueesta tai päinvastoin.</p>
        <ul className="share-compare">
          {rows.map(({ region, stats }) => {
            const memberShare = analysis.totals.members ? stats.members / analysis.totals.members : 0;
            return (
              <li key={region.id}>
                <span className="share-label">{region.number} {region.shortName}</span>
                <span className="share-bars" aria-label={`Pinta-ala ${formatPercent(stats.areaShare)}, jäsenet ${formatPercent(memberShare)}`}>
                  <span className="share-bar area" style={{ width: `${Math.min(100, stats.areaShare * 100 * 2)}%` }}>{formatPercent(stats.areaShare)}</span>
                  <span className="share-bar members" style={{ width: `${Math.min(100, memberShare * 100 * 2)}%`, background: region.color }}>{formatPercent(memberShare)}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="legend-inline"><span className="share-bar area sample" /> Pinta-ala <span className="share-bar members sample" /> Jäsenet</p>
      </section>
    </div>
  );
}
