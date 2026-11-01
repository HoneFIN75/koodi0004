import { useCompetitionData, useCompetitionStatistics } from '../state/useCompetitions';
import { describeCompetitionYears } from '../services/competitionService';
import type { Municipality } from '../models/region';
import { formatCount } from '../services/mapService';

export function MunicipalityCompetitionSummary({ name, municipality }: { name: string; municipality?: Municipality | null }) {
  const stats = useCompetitionStatistics({ municipality: name }, municipality ? [municipality] : undefined);
  const { yearFilter } = useCompetitionData();
  return <section className="municipality-competitions" aria-label={`${name}: kilpailutoiminta`}>
    <h3>Kunnan kilpailutoiminta</h3>
    <p>{name} · {describeCompetitionYears(yearFilter)}: <strong>{formatCount(stats?.total ?? null)}</strong> kilpailua.</p>
    <p className="hint">Kunnan kilpailut, ei seuran järjestämiksi kohdistettuja kilpailuja.</p>
    {stats && <dl>
      <div><dt>Kilpailuja / 10 000 asukasta (2025)</dt><dd>{formatCount(stats.municipalities[0]?.per10000Residents ?? (municipality?.population ? 0 : null))}</dd></div>
      <div><dt>Kilpailuja / 1 000 km²</dt><dd>{formatCount(stats.municipalities[0]?.per1000Km2 ?? (municipality && municipality.areaKm2 > 0 ? 0 : null))}</dd></div>
      {stats.byYear.map((row) => <div key={row.year}><dt>{row.year}</dt><dd>{row.count} kilpailua</dd></div>)}
    </dl>}
  </section>;
}
