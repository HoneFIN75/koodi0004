import { useEffect, useMemo, useState } from 'react';
import type { CompetitionContext } from '../state/useCompetitions';
import { formatCompetitionDate, getCompetitionYearColor, getPrimaryMunicipality } from '../services/competitionService';
import { CompetitionDetails } from './CompetitionDetails';
import { formatCount } from '../services/mapService';
import { exportCompetitionCsv, exportCompetitionJson } from '../services/competitionExportService';
import { per10000Residents } from '../services/populationService';

function download(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CompetitionPanel({ context }: { context: CompetitionContext }) {
  const { data, error, retry, filters, setFilters, reset, competitions, analysis, selected, select, regions } = context;
  const [limit, setLimit] = useState(50);
  const [qualityLimit, setQualityLimit] = useState(50);
  useEffect(() => setLimit(50), [filters]);
  const options = useMemo(() => {
    const sorted = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b, 'fi'));
    return {
      models: sorted(data?.competitions.map((item) => item.competitionModel) ?? []),
      tiers: sorted(data?.competitions.map((item) => item.pdgaTier) ?? []),
      organizers: sorted(data?.competitions.map((item) => item.organizer) ?? []),
    };
  }, [data]);
  return <section className="competition-panel panel planner-card" aria-label="Kilpailut">
    <h2>Kilpailut</h2>
    <p>Kilpailut ovat oma, julkinen viiteaineistonsa. Suodattimet ovat yhteiset Seurakartassa ja Aluesuunnittelussa; ne eivät muuta seura- tai suunnitelmatietoja.</p>
    {error && <p role="alert">{error} <button type="button" onClick={retry}>Yritä kilpailujen lataamista uudelleen</button></p>}
    {!data && !error && <p role="status">Ladataan kilpailuaineistoa…</p>}
    <div className="competition-controls">
      <label>Näytä kilpailut<select value={filters.visibility} onChange={(event) => setFilters({ visibility: event.target.value === 'all' ? 'all' : event.target.value === 'years' ? 'years' : 'hidden' })}>
        <option value="hidden">Piilota kilpailut</option><option value="all">Kaikki kilpailut · kaikki vuodet</option><option value="years">Valitut vuodet</option>
      </select></label>
      <label>Hae kilpailua, kuntaa tai rataa<input type="search" value={filters.query} onChange={(event) => setFilters({ query: event.target.value })} /></label>
      <label>Kilpailumalli<select value={filters.model} onChange={(event) => setFilters({ model: event.target.value })}><option value="">Kaikki kilpailumallit</option>{options.models.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>PDGA-luokitus<select value={filters.tier} onChange={(event) => setFilters({ tier: event.target.value })}><option value="">Kaikki luokitukset</option>{options.tiers.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Järjestäjä<select value={filters.organizer} onChange={(event) => setFilters({ organizer: event.target.value })}><option value="">Kaikki järjestäjät</option>{options.organizers.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Kunta · ensisijainen tai muu<input type="search" value={filters.municipality} onChange={(event) => setFilters({ municipality: event.target.value })} /></label>
      <label>Kilpailujen alue · ensisijainen kunta<select value={filters.regionId} onChange={(event) => setFilters({ regionId: event.target.value })}>
        <option value="">Kaikki alueet</option>{regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
        {filters.regionId && !regions.some((item) => item.id === filters.regionId) && <option value={filters.regionId}>Alue ei kuulu nykyiseen skenaarioon</option>}
      </select></label>
    </div>
    <fieldset className="competition-years"><legend>Valitse vuodet · useita voi valita</legend>
      <button type="button" onClick={() => setFilters({ visibility: 'all' })}>Kaikki vuodet</button>
      <button type="button" onClick={() => setFilters({ visibility: 'years', years: [] })}>Tyhjennä vuosivalinta</button>
      {(data?.years ?? []).map((year) => <label key={year}><input type="checkbox" checked={filters.visibility === 'all' || filters.years.includes(year)} onChange={(event) => {
        const years = filters.visibility === 'all' ? data?.years ?? [] : filters.years;
        setFilters({ visibility: 'years', years: event.target.checked ? [...new Set([...years, year])] : years.filter((value) => value !== year) });
      }} />{year}</label>)}
    </fieldset>
    <button type="button" onClick={reset}>Palauta kilpailujen oletussuodattimet</button>
    {data && <p role="status">{filters.visibility === 'hidden' ? 'Kilpailukerros on piilotettu.' : competitions.length ? `${competitions.length} yksilöllistä kilpailua valituilla suodattimilla.` : 'Ei kilpailuja valituilla suodattimilla'}</p>}
    {analysis && <div className="competition-summary">
      <span>Yksilölliset kilpailut: <strong>{analysis.uniqueCount}</strong></span>
      <span>Ensisijaiset isäntäkunnat: <strong>{analysis.primaryCodes.size}</strong></span>
      <span>Kaikki katetut kunnat: <strong>{analysis.coveredCodes.size}</strong></span>
      <span>Kilpailuradat: <strong>{analysis.courses}</strong></span>
      <span>Katettujen kuntien väestö 2025: <strong>{formatCount(analysis.coveredPopulation)}</strong></span>
      <span>Ilman ensisijaista karttakohdistusta: <strong>{analysis.unmappedCount}</strong></span>
    </div>}
    {filters.visibility !== 'hidden' && <ul className="competition-year-legend" aria-label="Karttamerkkien selite">{[...new Set(competitions.flatMap((item) => item.year === null ? [] : [item.year]))].sort().map((year) => <li key={year}><i style={{ background: getCompetitionYearColor(year) }} />Kilpailuvuosi {year}</li>)}</ul>}
    {selected && <CompetitionDetails competition={selected} onClose={() => select(null)} />}
    {analysis && <div className="competition-chart-grid">
      <CompetitionBars title="Kilpailut vuosittain" rows={[...analysis.yearCounts].sort(([a], [b]) => a - b).map(([year, count]) => ({ label: String(year), count, color: getCompetitionYearColor(year) }))} />
      <CompetitionBars title="Ensisijaiset isäntäkunnat · kilpailujen määrä" rows={[...analysis.primaryCounts].map(([code, count]) => ({ label: context.municipalities?.byCode.get(code)?.name ?? code, count }))} />
      <CompetitionBars title="Ensisijaiset kilpailut / 10 000 asukasta" rows={[...analysis.primaryCounts].flatMap(([code, count]) => { const municipality = context.municipalities?.byCode.get(code); const value = per10000Residents(count, municipality?.population ?? null); return municipality && value !== null ? [{ label: municipality.name, count: value }] : []; })} />
      <CompetitionBars title="Kilpailumallit" rows={[...analysis.modelCounts].map(([label, count]) => ({ label, count }))} />
      <CompetitionBars title="PDGA-luokitukset" rows={[...analysis.tierCounts].map(([label, count]) => ({ label, count }))} />
      <CompetitionBars title="Järjestäjät · yksilölliset kilpailut" rows={[...analysis.organizerCounts].map(([label, count]) => ({ label, count }))} />
      <CompetitionBars title="Alueet · ensisijaisesti järjestetyt kilpailut" rows={[...analysis.regionCounts].map(([id, count]) => ({ label: regions.find((item) => item.id === id)?.name ?? id, count }))} />
    </div>}
    <p className="hint">Ensisijaisen kunnan tilastot laskevat tapahtuman kerran. Muiden kuntien mukanaolo kuvaa kattavuutta. Päällekkäisten suunnittelualueiden lukuja ei saa summata kansalliseksi kilpailumääräksi. Kohdistamattomat kunnat eivät sisälly kattavuus- tai väestölukuihin. Väestö ei kuvaa osallistujien asuinkuntia.</p>
    <div className="competition-actions">
      <button type="button" disabled={!data} onClick={() => download(exportCompetitionJson(competitions, filters), 'kilpailut-suodatetut.json', 'application/json')}>Vie kilpailut JSON</button>
      <button type="button" disabled={!data} onClick={() => download(exportCompetitionCsv(competitions), 'kilpailut-suodatetut.csv', 'text/csv;charset=utf-8')}>Vie kilpailut CSV</button>
    </div>
    <ol className="competition-list" aria-label="Kilpailuluettelo">{competitions.slice(0, limit).map((competition) => <li key={competition.id}>
      <button type="button" aria-pressed={selected?.id === competition.id} onClick={() => select(competition.id)}>
        <strong>{competition.name} · {competition.year ?? 'Vuosi puuttuu'}</strong>
        <span>{getPrimaryMunicipality(competition)?.name ?? 'Ensisijainen kunta puuttuu'} · {formatCompetitionDate(competition.startDate)}–{formatCompetitionDate(competition.endDate)} · {competition.pdgaTier}</span>
        <small>{competition.municipalities.length > 1 ? `Muut kunnat: ${competition.municipalities.filter((item) => !item.primary).map((item) => item.name).join(', ')}` : competition.organizer}{competition.issues.length ? ' · aineistossa huomautuksia' : ''}</small>
      </button>
    </li>)}</ol>
    {competitions.length > limit && <button type="button" onClick={() => setLimit((value) => value + 50)}>Näytä lisää kilpailuja ({competitions.length - limit})</button>}
    {!!data?.issues.length && <details className="competition-quality"><summary>Aineiston huomautukset ({data.issues.length})</summary><p>Alkuperäisiä tietoja ei ole korjattu tai poistettu. Virheelliset päivämäärät eivät tuota kestoa, eikä epäselvää kuntaa sijoiteta kartalle.</p><ul tabIndex={0} aria-label="Vieritettävä aineiston huomautusluettelo">{data.issues.slice(0, qualityLimit).map((issue, index) => <li key={index}>Rivi {issue.sourceIndex + 1}: {issue.name} — {issue.message}</li>)}</ul>{data.issues.length > qualityLimit && <button type="button" onClick={() => setQualityLimit((value) => value + 50)}>Näytä lisää huomautuksia ({data.issues.length - qualityLimit})</button>}</details>}
  </section>;
}

function CompetitionBars({ title, rows }: { title: string; rows: { label: string; count: number; color?: string }[] }) {
  const sorted = [...rows].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fi')).slice(0, 10);
  const max = Math.max(1, ...sorted.map((row) => row.count));
  return <section className="competition-chart"><h3>{title}</h3><ul>{sorted.map((row) => <li key={row.label}><span>{row.label}: <strong>{row.count.toLocaleString('fi-FI', { maximumFractionDigits: 2 })}</strong></span><div className="bar-track"><span style={{ width: `${row.count / max * 100}%`, background: row.color ?? 'var(--accent)' }} /></div></li>)}</ul>{!rows.length && <p>Ei kilpailuja valituilla suodattimilla</p>}</section>;
}
