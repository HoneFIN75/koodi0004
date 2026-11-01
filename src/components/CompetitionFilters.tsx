import { COMPETITION_FILE } from '../models/competition';
import { describeCompetitionYears } from '../services/competitionService';
import { refreshCompetitions } from '../state/competitionStore';
import { useCompetitionData } from '../state/useCompetitions';

export function CompetitionFilters() {
  const { index, yearFilter, setYearFilter, error, refreshing, updatedAt } = useCompetitionData();
  const years = [...new Set([...(index?.years ?? []), ...(yearFilter.mode === 'selected' ? yearFilter.years : yearFilter.mode === 'range' ? [yearFilter.from, yearFilter.to] : [])])].sort((a, b) => a - b);
  const latest = years[years.length - 1];
  return <section className="competition-filters panel planner-card" aria-label="Kilpailujen vuosisuodatus">
    <div className="competition-controls">
      <label>Kilpailujen vuodet
        <select value={yearFilter.mode} disabled={!index} onChange={(event) => {
          if (event.target.value === 'all') setYearFilter({ mode: 'all' });
          else if (event.target.value === 'selected') setYearFilter({ mode: 'selected', years: latest ? [latest] : [] });
          else if (years.length) setYearFilter({ mode: 'range', from: years[0], to: latest });
        }}>
          <option value="all">Kaikki vuodet</option>
          <option value="selected">Yksi tai useampi vuosi</option>
          <option value="range" disabled={!years.length}>Vuosiväli</option>
        </select>
      </label>
      <button type="button" className="clear-filters" disabled={refreshing} onClick={() => void refreshCompetitions()}>{refreshing ? 'Ladataan kilpailuja…' : 'Päivitä kilpailuaineisto'}</button>
    </div>
    {yearFilter.mode === 'selected' && <fieldset className="competition-years"><legend>Valitse kilpailuvuodet</legend>
      {years.map((year) => <label key={year}><input type="checkbox" checked={yearFilter.years.includes(year)} onChange={(event) => setYearFilter({
        mode: 'selected', years: event.target.checked ? [...yearFilter.years, year] : yearFilter.years.filter((value) => value !== year),
      })} /> {year}</label>)}
    </fieldset>}
    {yearFilter.mode === 'range' && <div className="competition-controls">
      <label>Alkuvuosi<select value={yearFilter.from} onChange={(event) => { const from = Number(event.target.value); setYearFilter({ mode: 'range', from, to: Math.max(from, yearFilter.to) }); }}>
        {years.map((year) => <option key={year} value={year}>{year}</option>)}
      </select></label>
      <label>Loppuvuosi<select value={yearFilter.to} onChange={(event) => { const to = Number(event.target.value); setYearFilter({ mode: 'range', from: Math.min(to, yearFilter.from), to }); }}>
        {years.map((year) => <option key={year} value={year}>{year}</option>)}
      </select></label>
    </div>}
    <p className="hint" role="status">Kilpailurajaus: {describeCompetitionYears(yearFilter)}. Rajaus koskee kaikkia kilpailutilastoja ja raportteja, ei ajattomia seura- tai väestötietoja.</p>
    {error && <p className="data-warning" role="alert">{error} {index ? 'Näytetään edellinen onnistuneesti ladattu kilpailuaineisto; luvut voivat olla vanhentuneita.' : 'Kilpailutilastot eivät ole saatavilla.'}</p>}
    {!index && !error && <p role="status">Ladataan kilpailuaineistoa…</p>}
    <details><summary>Kilpailujen tietolähde</summary><p>{COMPETITION_FILE} · {index?.records.length ?? '–'} aineistoriviä. Tarkistetaan 60 sekunnin välein sekä palattaessa sovellukseen. Viimeisin onnistunut tarkistus: {updatedAt ? new Date(updatedAt).toLocaleString('fi-FI') : 'ei vielä'}.</p></details>
  </section>;
}
