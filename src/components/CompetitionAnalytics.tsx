import { useState } from 'react';
import type { CompetitionScope } from '../models/competition';
import type { Municipality } from '../models/region';
import { compareCompetitionYears, describeCompetitionYears } from '../services/competitionService';
import { useCompetitionData, useCompetitionStatistics } from '../state/useCompetitions';
import { ChartCard } from './ChartCard';
import { formatCount } from '../services/mapService';
import { exportCompetitionCsv } from '../services/exportService';
import { normalizeMunicipalityName } from '../services/populationService';

const percentage = (value: number | null) => value === null ? 'Ei vertailupohjaa' : `${value > 0 ? '+' : ''}${value.toLocaleString('fi-FI', { maximumFractionDigits: 1 })} %`;
const change = (value: number | null) => value === null ? '–' : `${value > 0 ? '+' : ''}${value}`;

export function CompetitionAnalytics({ geography, scope = {}, title = 'Kilpailutoiminnan analyysi' }: {
  geography?: readonly Municipality[]; scope?: CompetitionScope; title?: string;
}) {
  const { index, yearFilter, error } = useCompetitionData();
  const stats = useCompetitionStatistics(scope, geography);
  const [municipality, setMunicipality] = useState('');
  const [comparison, setComparison] = useState<[number | null, number | null]>([null, null]);
  const [rankingLimit, setRankingLimit] = useState(20);
  const municipalityStats = useCompetitionStatistics({ ...scope, municipality: municipality || scope.municipality }, geography);
  if (!stats) return <section className="panel planner-card competition-analytics"><h2>{title}</h2><p>Kilpailutilastot eivät ole vielä saatavilla. Katso aineiston tila vuosisuodattimesta.</p></section>;
  const allowedNames = scope.municipalityNames ? new Set(scope.municipalityNames.map(normalizeMunicipalityName)) : null;
  const municipalityOptions = [...(index?.byMunicipality.values() ?? [])].filter((item) => !allowedNames || allowedNames.has(normalizeMunicipalityName(item.name))).map((item) => item.name).sort((a, b) => a.localeCompare(b, 'fi'));
  const first = stats.byYear.find((row) => row.year === comparison[0]) ?? stats.byYear[0];
  const last = stats.byYear.find((row) => row.year === comparison[1]) ?? stats.byYear[stats.byYear.length - 1];
  const historicalComparison = first && last ? compareCompetitionYears(stats.byYear, first.year, last.year) : null;
  return <section className="panel planner-card competition-analytics" aria-label={title}>
    <h2>{title}</h2>
    <button type="button" className="clear-filters" disabled={Boolean(error)} onClick={() => {
      const url = URL.createObjectURL(new Blob([exportCompetitionCsv(stats)], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url; link.download = 'kilpailutilastot.csv';
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}>Vie kilpailutilastot CSV</button>
    <p className="hint">Kilpailuvuodet: {describeCompetitionYears(yearFilter)}{scope.municipality ? ` · ${scope.municipality}` : ''}.</p>
    <div className="competition-kpis" role="status" aria-live="polite">
      <p><strong data-testid="competition-total">{formatCount(stats.total)}</strong> kilpailua</p>
      <p><strong>{stats.municipalityCount}</strong> aktiivista kuntaa</p>
      <p><strong>{formatCount(stats.averagePerMunicipality)}</strong> kilpailua / aktiivinen kunta</p>
      <p>Aktiivisin: <strong>{stats.municipalities[0]?.name ?? 'Ei kilpailuja'}</strong></p>
    </div>
    <p>Kukin aineistorivi lasketaan yhdeksi kilpailuksi, myös samannimiset rivit. Aineisto ei sisällä osallistujamääriä, päivämääriä tai toteutumisen tilaa.</p>
    <div className="competition-charts">
      <ChartCard title="Kilpailut vuosittain" description="Vain valitut vuodet" rows={stats.byYear.map((row) => ({ label: String(row.year), count: row.count }))} />
      <ChartCard title="Kilpailutoiminnan jakauma" description="Aktiivisia kuntia kilpailumäärän mukaan" rows={stats.distribution} />
      <ChartCard title="Aktiivisimmat kilpailukunnat" description="Kymmenen suurinta kilpailumäärää valittuina vuosina" rows={stats.municipalities.slice(0, 10).map((row) => ({ label: row.name, count: row.count }))} />
    </div>
    <div className="competition-table" tabIndex={0} role="region" aria-label="Vieritettävä kilpailuvuosien taulukko">
      <table className="data-table"><caption>Vuositrendit ja vuosimuutokset</caption>
        <thead><tr><th scope="col">Vuosi</th><th scope="col">Kilpailuja</th><th scope="col">Aktiivisia kuntia</th><th scope="col">Muutos edellisvuodesta</th><th scope="col">Muutos %</th><th scope="col">Uusia kuntia</th></tr></thead>
        <tbody>{stats.byYear.map((row) => <tr key={row.year}><th scope="row">{row.year}</th><td>{row.count}</td><td>{row.municipalityCount}</td><td>{change(row.change)}</td><td>{percentage(row.changePercent)}</td><td>{row.newMunicipalities.length ? <details><summary>{row.newMunicipalities.length} kuntaa</summary>{row.newMunicipalities.join(', ')}</details> : '0'}</td></tr>)}</tbody>
      </table>
    </div>
    <p className="hint">Uusi kunta = ensimmäinen esiintymisvuosi koko aineistossa, ei ensimmäinen valittu vuosi. Vuosimuutos näytetään vain, jos myös edellinen kalenterivuosi on valittu. Keskeneräiset tai tulevat vuodet eivät ole suoraan vertailukelpoisia.</p>
    {stats.byYear.length > 1 && <>
      <h3>Valittujen vuosien historiallinen vertailu</h3>
      <div className="competition-controls">{[first, last].map((row, i) => <label key={i}>Vertailuvuosi {i + 1}<select value={row.year} onChange={(event) => setComparison(i === 0 ? [Number(event.target.value), last.year] : [first.year, Number(event.target.value)])}>
        {stats.byYear.map((item) => <option key={item.year} value={item.year}>{item.year}</option>)}
      </select></label>)}</div>
      <p role="status">{first.year}: {first.count} kilpailua · {last.year}: {last.count} kilpailua · Ero {change(historicalComparison?.change ?? null)} ({percentage(historicalComparison?.changePercent ?? null)}).</p>
    </>}
    <details open={stats.municipalities.length <= 10}><summary>Kuntien kilpailuranking ja tiheydet ({stats.municipalityCount})</summary>
      <p className="hint">Kilpailutiheys käyttää kiinteää väestövuotta 2025 ja kuntien pinta-alaa. Ei osallistujatiheys. Samat kilpailumäärät saavat saman sijoituksen.</p>
      <div className="competition-table" tabIndex={0} role="region" aria-label="Vieritettävä kuntien kilpailuranking"><table className="data-table">
        <thead><tr><th scope="col">Sijoitus</th><th scope="col">Kunta</th><th scope="col">Kilpailuja</th><th scope="col">Osuus kilpailuista</th><th scope="col">Aktiivisia valittuja vuosia</th><th scope="col">Kilpailuja / 10 000 as.</th><th scope="col">Kilpailuja / 1 000 km²</th></tr></thead>
        <tbody>{stats.municipalities.slice(0, rankingLimit).map((row) => <tr key={row.name}><td>{row.rank}</td><th scope="row">{row.name}</th><td>{row.count}</td><td>{percentage(row.share * 100)}</td><td>{row.activeYears}</td><td>{formatCount(row.per10000Residents)}</td><td>{formatCount(row.per1000Km2)}</td></tr>)}</tbody>
      </table></div>
      {rankingLimit < stats.municipalities.length && <button type="button" className="clear-filters" onClick={() => setRankingLimit((limit) => limit + 20)}>Näytä lisää kilpailukuntia ({Math.min(rankingLimit, stats.municipalities.length)} / {stats.municipalities.length})</button>}
    </details>
    {!scope.municipality && <label className="competition-trend-select">Kunnan osallistumistrendi<select value={municipality} onChange={(event) => setMunicipality(event.target.value)}>
      <option value="">Valitse kunta</option>{municipalityOptions.map((name) => <option key={name} value={name}>{name}</option>)}
    </select></label>}
    {(municipality || scope.municipality) && <ChartCard title={`Kilpailuaktiivisuus · ${municipality || scope.municipality}`} description="Kunnan kilpailumäärä valittuina vuosina, myös nollavuodet"
      rows={(municipalityStats?.byYear ?? []).map((row) => ({ label: String(row.year), count: row.count }))} />}
    {stats.total === 0 && <p className="empty-note">Valitussa rajauksessa ei ole kilpailuja.</p>}
  </section>;
}
