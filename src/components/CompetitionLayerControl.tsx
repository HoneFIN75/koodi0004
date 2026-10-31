import type { CompetitionContext } from '../state/useCompetitions';
import { getCompetitionYearColor } from '../services/competitionService';

export function CompetitionLayerControl({ context }: { context: CompetitionContext }) {
  return <div className="competition-layer-control">
    <label>Kilpailut kartalla<select value={context.filters.visibility} onChange={(event) => context.setFilters({ visibility: event.target.value === 'all' ? 'all' : event.target.value === 'years' ? 'years' : 'hidden' })}><option value="hidden">Piilota kilpailut</option><option value="all">Kaikki kilpailut</option><option value="years">Valitut vuodet</option></select></label>
    <span>{context.data ? `${context.competitions.length} yksilöllistä kilpailua` : 'Kilpailuaineisto ei ole vielä käytettävissä'} · vuosivalinta ja muut kilpailusuodattimet alla</span>
    {context.filters.visibility !== 'hidden' && <ul className="competition-year-legend" aria-label="Karttamerkkien selite">{[...new Set(context.competitions.flatMap((item) => item.year === null ? [] : [item.year]))].sort().map((year) => <li key={year}><i style={{ background: getCompetitionYearColor(year) }} />{year}</li>)}</ul>}
  </div>;
}
