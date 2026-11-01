import { useMemo, useState } from 'react';
import type { Municipality } from '../models/region';
import { getMunicipalityRank, getPopulationCategory, matchesPopulation, normalizeMunicipalityName, per10000Residents, populationCategories, populationService, summarizePopulation, type PopulationFilters as Filters } from '../services/populationService';
import { PopulationFilters } from './PopulationFilters';
import { formatCount } from '../services/mapService';
import { useCompetitionStatistics } from '../state/useCompetitions';

export function PopulationExplorer({ municipalities }: { municipalities: Municipality[] }) {
  const [filters, setFilters] = useState<Filters>({});
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(10);
  const [smallest, setSmallest] = useState(false);
  const [comparison, setComparison] = useState<[string, string]>(['', '']);
  const summary = useMemo(() => summarizePopulation(municipalities), [municipalities]);
  const filtered = useMemo(() => summary.sorted.filter((item) => matchesPopulation(item.population, filters)
    && [item.name, item.nameSv ?? ''].some((name) => normalizeMunicipalityName(name).includes(normalizeMunicipalityName(query)))), [summary, filters, query]);
  const rows = smallest ? [...filtered].reverse() : filtered;
  const competitions = useCompetitionStatistics({ municipalityNames: filtered.map((item) => item.name) }, municipalities);
  const competitionCounts = new Map(competitions?.municipalities.map((item) => [normalizeMunicipalityName(item.name), item]));
  const categories = populationCategories.map((category) => ({
    ...category,
    count: filtered.filter((item) => getPopulationCategory(item.population)?.id === category.id).length,
    population: filtered.filter((item) => getPopulationCategory(item.population)?.id === category.id).reduce((sum, item) => sum + (item.population ?? 0), 0),
  }));
  const maximum = Math.max(1, ...categories.map((item) => item.population));
  const selected = comparison.map((code) => municipalities.find((item) => item.code === code));
  return <section className="population-panel panel planner-card" aria-label="Kuntien väestöanalyysi">
    <h2>Kuntien väestöanalyysi · 2025</h2>
    <p>Suomi: {formatCount(summary.total)} asukasta · {municipalities.length} kuntaa. Keskiarvo {formatCount(summary.average)}, mediaani {formatCount(summary.median)}.</p>
    <p>Suurin: {summary.largest?.name ?? 'Ei tietoa'} ({formatCount(summary.largest?.population ?? null)}) · Pienin: {summary.smallest?.name ?? 'Ei tietoa'} ({formatCount(summary.smallest?.population ?? null)}).</p>
    <p className="hint">Käyttäjän toimittama aineisto; alkuperäistä lähdettä ja vuoden sisäistä viitepäivää ei ole ilmoitettu. Väestöluokat ovat kokoluokkia, eivät hallinnollisia kaupunkiluokituksia.</p>
    {populationService.warnings.length > 0 && <p role="alert">{populationService.warnings.join(' ')}</p>}
    {summary.missing.length > 0 && <p role="alert">Väestötieto puuttuu: {summary.missing.join(', ')}. Kokonaisväestöä ei esitetä täydellisenä.</p>}
    <PopulationFilters filters={filters} onChange={setFilters} />
    <div className="population-controls">
      <label>Hae väestökunnan nimeä<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label>Väestöjärjestys<select value={smallest ? 'smallest' : 'largest'} onChange={(event) => setSmallest(event.target.value === 'smallest')}><option value="largest">Suurimmat ensin</option><option value="smallest">Pienimmät ensin</option></select></label>
      <label>Näytettäviä kuntia<select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>{[10, 20, 50, 0].map((count) => <option key={count} value={count}>{count === 0 ? 'Kaikki' : count}</option>)}</select></label>
    </div>
    <p role="status">{filtered.length} kuntaa rajauksessa · {formatCount(summarizePopulation(filtered).total)} asukasta.</p>
    <p>Rajauksen kilpailutoiminta aktiivisina kilpailuvuosina: {formatCount(competitions?.total ?? null)} kilpailua · {competitions?.municipalityCount ?? '–'} aktiivista kuntaa.</p>
    <div className="population-table" tabIndex={0} role="region" aria-label="Vieritettävä kuntien väestötaulukko"><table className="data-table"><caption>Kunnat väestömäärän mukaan</caption>
      <thead><tr><th scope="col">Kunta</th><th scope="col">Väestö 2025</th><th scope="col">Suomen sijoitus</th><th scope="col">Väestöluokka</th><th scope="col">Osuus Suomesta</th><th scope="col">Kilpailuja · valitut vuodet</th><th scope="col">Kilpailuja / 10 000 as.</th></tr></thead>
      <tbody>{rows.slice(0, limit || rows.length).map((item) => {
        const count = competitions ? competitionCounts.get(normalizeMunicipalityName(item.name))?.count ?? 0 : null;
        return <tr key={item.code}><th scope="row">{item.name}</th><td>{formatCount(item.population)}</td><td>{getMunicipalityRank(item.name) ?? 'Ei tietoa'}</td><td>{getPopulationCategory(item.population)?.label ?? 'Ei tietoa'}</td><td>{summary.total && item.population !== null ? `${(item.population / summary.total * 100).toLocaleString('fi-FI', { maximumFractionDigits: 2 })} %` : 'Ei tietoa'}</td><td>{formatCount(count)}</td><td>{formatCount(per10000Residents(count, item.population))}</td></tr>;
      })}</tbody>
    </table></div>
    <h3>Väestöluokkien jakauma rajauksessa</h3>
    <ul className="population-distribution">{categories.map((item) => <li key={item.id}><span>{item.label}: {item.count} kuntaa · {formatCount(item.population)} asukasta</span><div className="bar-track"><span style={{ width: `${item.population / maximum * 100}%`, background: item.color }} /></div></li>)}</ul>
    <h3>Kuntien väestövertailu</h3>
    <div className="population-controls">{comparison.map((code, index) => <label key={index}>Vertailukunta {index + 1}<select value={code} onChange={(event) => setComparison(index === 0 ? [event.target.value, comparison[1]] : [comparison[0], event.target.value])}><option value="">Valitse kunta</option>{municipalities.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>)}</div>
    {selected[0] && selected[1] && <p role="status">{selected[0].name}: {formatCount(selected[0].population)} · {selected[1].name}: {formatCount(selected[1].population)}. Väestöero: {selected[0].population !== null && selected[1].population !== null ? formatCount(Math.abs(selected[0].population - selected[1].population)) : 'Ei tietoa'} asukasta.</p>}
    {selected[0] && selected[1] && <p>Kilpailuja valittuina vuosina (väestörajauksen mukaiset kunnat): {selected.map((item) => item ? `${item.name}: ${!filtered.includes(item) ? 'ei rajauksessa' : competitions ? competitionCounts.get(normalizeMunicipalityName(item.name))?.count ?? 0 : 'ei tietoa'}` : '').join(' · ')}.</p>}
  </section>;
}
