import type { CompetitionContext } from '../state/useCompetitions';
import { getPrimaryMunicipality } from '../services/competitionService';
import { formatCount } from '../services/mapService';
import { per10000Residents } from '../services/populationService';

export function CompetitionScope({ context, codes, title }: { context: CompetitionContext; codes: string[]; title: string }) {
  if (context.filters.visibility === 'hidden') return <p className="hint">Kilpailutilastot on piilotettu. Ota kilpailut käyttöön yhteisistä kilpailusuodattimista.</p>;
  if (!context.scopeFor) return <p role="status">Kilpailutilastot eivät ole saatavilla. Tarkista kilpailupaneelin lataustila.</p>;
  const { primary, associated, coverage, population } = context.scopeFor(codes);
  return <section className="competition-scope" aria-label={`${title} · kilpailut`}>
    <h3>{title} · kilpailut</h3><p className="hint">Yhteisten kilpailusuodattimien mukaiset luvut</p>
    <dl>
      <div><dt>Ensisijaisesti järjestetyt kilpailut</dt><dd>{primary.length}</dd></div>
      <div><dt>Kaikki liittyvät yksilölliset kilpailut</dt><dd>{associated.length}</dd></div>
      <div><dt>Ensisijaiset kilpailut / 10 000 asukasta</dt><dd>{formatCount(per10000Residents(primary.length, population))}</dd></div>
      <div><dt>Liittyvien kilpailujen kattamat kunnat</dt><dd>{coverage?.coveredCodes.size ?? 'Ei tietoa'}</dd></div>
      <div><dt>Kilpailuvuodet</dt><dd>{[...new Set(associated.flatMap((item) => item.year === null ? [] : [item.year]))].sort().join(', ') || 'Ei kilpailuja'}</dd></div>
    </dl>
    <details><summary>Kilpailut ({associated.length})</summary><ul>{associated.map((item) => <li key={item.id}><button type="button" onClick={() => context.select(item.id)}>{item.name} · {item.year ?? 'Vuosi puuttuu'} · {getPrimaryMunicipality(item)?.name ?? 'Kohdistus puuttuu'}</button></li>)}</ul></details>
  </section>;
}
