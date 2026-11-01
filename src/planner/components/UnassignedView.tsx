import { useState } from 'react';
import { MapPinned } from 'lucide-react';
import type { Region } from '../../models/region';
import { formatArea, type ScenarioAnalysis } from '../../services/regionAnalytics';
import { StatCard, integerFormat } from './ui';
import { formatCount } from '../../services/mapService';

interface UnassignedViewProps {
  analysis: ScenarioAnalysis;
  regions: Region[];
  onShowOnMap: () => void;
  onAssign: (regionId: string, codes: string[]) => void;
}

export function UnassignedView({ analysis, regions, onShowOnMap, onAssign }: UnassignedViewProps) {
  const [target, setTarget] = useState('');
  const [onlyWithClubs, setOnlyWithClubs] = useState(false);
  const rows = analysis.unassigned.filter((row) => !onlyWithClubs || row.clubs.length > 0);
  const totals = analysis.unassigned.reduce((sum, row) => ({ clubs: sum.clubs + row.clubs.length, members: sum.members + row.members, votes: sum.votes + row.votes, area: sum.area + row.municipality.areaKm2 }), { clubs: 0, members: 0, votes: 0, area: 0 });
  const enabled = [...regions].filter((region) => region.enabled).sort((a, b) => a.number - b.number);
  return (
    <div className="view-stack">
      <header className="view-header">
        <div><p className="eyebrow">KATTAVUUSAUKOT</p><h2>Kohdistamattomat kunnat</h2><p>Kunnat, jotka eivät kuulu yhteenkään käytössä olevaan alueeseen.</p></div>
        <button type="button" className="primary-button" onClick={onShowOnMap}><MapPinned size={16} /> Korosta kartalla</button>
      </header>
      <div className="stat-grid">
        <StatCard label="Kohdistamattomien kuntien kilpailut" value={formatCount(analysis.totals.unassignedCompetitions)} detail="aktiiviset kilpailuvuodet" />
        <StatCard label="Kohdistamaton väestö 2025" value={formatCount(analysis.totals.unassignedPopulation)} />
        <StatCard label="Kohdistamattomia kuntia" value={analysis.unassigned.length} tone={analysis.unassigned.length ? 'warning' : undefined} />
        <StatCard label="Kohdistamattomia seuroja" value={totals.clubs} />
        <StatCard label="Kohdistamattomia jäseniä" value={integerFormat.format(totals.members)} />
        <StatCard label="Kohdistamaton äänimäärä" value={integerFormat.format(totals.votes)} />
        <StatCard label="Kohdistamaton pinta-ala" value={formatArea(totals.area)} />
      </div>
      {analysis.totals.unplacedClubs.length > 0 && <p className="notice">{analysis.totals.unplacedClubs.length} seuraa ei voitu kohdistaa mihinkään kuntaan: {analysis.totals.unplacedClubs.map((club) => club.seura).join(', ')}.</p>}
      <section className="planner-card table-card">
        <div className="table-toolbar">
          <label className="checkbox"><input type="checkbox" checked={onlyWithClubs} onChange={(event) => setOnlyWithClubs(event.target.checked)} /> Vain kunnat, joissa on seuroja</label>
          {enabled.length > 0 && rows.length > 0 && (
            <div className="inline-form">
              <select value={target} onChange={(event) => setTarget(event.target.value)} aria-label="Kohdealue">
                <option value="">Valitse alue…</option>
                {enabled.map((region) => <option key={region.id} value={region.id}>{region.number} {region.name}</option>)}
              </select>
              <button type="button" className="secondary-button" disabled={!target} onClick={() => onAssign(target, rows.map((row) => row.municipality.code))}>Lisää näytetyt ({rows.length}) alueeseen</button>
            </div>
          )}
        </div>
        <table className="data-table">
          <thead><tr><th scope="col">Kunta</th><th scope="col">Maakunta</th><th scope="col">Väestö 2025</th><th scope="col">Kilpailuja · valitut vuodet</th><th scope="col" className="numeric">Seuroja</th><th scope="col" className="numeric">Jäseniä</th><th scope="col" className="numeric">Äänimäärä</th><th scope="col" className="numeric">Pinta-ala</th>{enabled.length > 0 && <th scope="col"><span className="sr-only">Toiminnot</span></th>}</tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.municipality.code}>
                <th scope="row">{row.municipality.name}</th>
                <td>{row.municipality.province ?? '–'}</td>
                <td>{formatCount(row.municipality.population)}</td>
                <td>{formatCount(row.competitionCount)}</td>
                <td className="numeric">{row.clubs.length}</td>
                <td className="numeric">{integerFormat.format(row.members)}</td>
                <td className="numeric">{row.votes}</td>
                <td className="numeric">{formatArea(row.municipality.areaKm2)}</td>
                {enabled.length > 0 && <td><button type="button" className="text-button" disabled={!target} onClick={() => onAssign(target, [row.municipality.code])} aria-label={`Lisää ${row.municipality.name} valittuun alueeseen`}>Lisää</button></td>}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={enabled.length > 0 ? 9 : 8} className="empty-text">Kaikki kunnat on kohdistettu alueisiin.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
