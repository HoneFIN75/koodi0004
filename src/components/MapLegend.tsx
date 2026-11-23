import { markerColor, markerRadius } from '../services/mapService';
import { VOTING_POWERS } from '../services/membershipRules.ts';

export function MapLegend() {
  return (
    <details className="map-key">
      <summary>Kartan selite</summary>
      <div className="legend-body">
        <strong>Koko = jäsenmäärä</strong>
        <div className="size-key">
          {[25, 75, 150, 300, 1000].map((count) => (
            <span key={count}><i style={{ width: markerRadius(count) * 2, height: markerRadius(count) * 2 }} /><small>{count === 1000 ? '999+' : count}</small></span>
          ))}
        </div>
        <strong>Väri = äänivalta</strong>
        <div className="vote-key">
          {VOTING_POWERS.map((votes) => <span key={votes}><i style={{ background: markerColor(votes) }} />{votes} ääntä</span>)}
        </div>
        <p>Äänivalta määräytyy jäsenmäärän mukaan.<br />Harmaa: jäsenmäärä puuttuu.<br />Ryhmässä oleva luku = seurojen määrä.</p>
      </div>
    </details>
  );
}
