import { getCompetitionLegend } from '../services/competitionMapService.ts';

export function CompetitionLayerLegend({ maximum }: { maximum: number }) {
  return (
    <div className="competition-layer-legend" aria-label="Kilpailumäärien selite">
      <strong>Kilpailurivejä kunnittain</strong>
      {getCompetitionLegend(maximum).map((item) => (
        <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>
      ))}
    </div>
  );
}
