import { Layers, Map as MapIcon, MapPinned, Scale, Users, Vote, Flag, Shapes, Maximize2, Minimize2 } from 'lucide-react';
import type { MunicipalityDataset, Region } from '../../models/region';
import { formatArea, formatPercent, type ScenarioAnalysis } from '../../services/regionAnalytics';
import type { ValidationWarning } from '../../services/validationService';
import { BarChart, StatCard, WarningList, integerFormat } from './ui';
import { formatCount } from '../../services/mapService';

interface DashboardViewProps {
  analysis: ScenarioAnalysis;
  regions: Region[];
  dataset: MunicipalityDataset;
  scenarioCount: number;
  scenarioName: string;
  warnings: ValidationWarning[];
  filtered: boolean;
  onSelectRegion: (id: string) => void;
}

export function DashboardView({ analysis, regions, dataset, scenarioCount, scenarioName, warnings, filtered, onSelectRegion }: DashboardViewProps) {
  const active = analysis.activeRegions.map((region) => ({ region, stats: analysis.stats.get(region.id)! })).filter((item) => item.stats.municipalityCount > 0);
  const byArea = [...active].sort((a, b) => b.stats.areaKm2 - a.stats.areaKm2);
  const largest = byArea[0];
  const smallest = byArea[byArea.length - 1];
  const assignedArea = [...analysis.assignedCodes].reduce((sum, code) => sum + (dataset.byCode.get(code)?.areaKm2 ?? 0), 0);
  const label = (region: Region) => `${region.number} ${region.shortName}`;
  return (
    <div className="view-stack">
      <header className="view-header">
        <div><p className="eyebrow">JOHDON KOJELAUTA</p><h2>{scenarioName}</h2><p>{filtered ? 'Seuraluvut on laskettu suodatetusta aineistosta.' : 'Luvut lasketaan reaaliaikaisesti seura-aineistosta ja kuntarajoista.'}</p></div>
      </header>
      <div className="stat-grid">
        <StatCard icon={Users} label="Suomen väestö 2025" value={formatCount(analysis.totals.nationalPopulation)} />
        <StatCard icon={Users} label="Alueiden kattama väestö" value={formatCount(analysis.totals.assignedPopulation)} detail="jokainen kunta vain kerran" />
        <StatCard icon={Users} label="Kohdistamaton väestö" value={formatCount(analysis.totals.unassignedPopulation)} />
        <StatCard icon={Users} label="Seurojen kotikuntien väestö" value={formatCount(analysis.totals.clubMunicipalityPopulation)} detail="suodatuksen mukaiset seurat, kunnat kerran" />
        <StatCard icon={Flag} label="Seuroja" value={integerFormat.format(analysis.totals.clubs)} detail={analysis.totals.unplacedClubs.length ? `${analysis.totals.unplacedClubs.length} ilman kuntaa` : 'kaikki kohdistettu kuntiin'} />
        <StatCard icon={Users} label="Jäseniä" value={integerFormat.format(analysis.totals.members)} />
        <StatCard icon={Vote} label="Äänimäärä yhteensä" value={integerFormat.format(analysis.totals.votes)} />
        <StatCard icon={Shapes} label="Alueita" value={regions.length} detail={`${analysis.activeRegions.length} käytössä`} />
        <StatCard icon={Layers} label="Skenaarioita" value={scenarioCount} />
        <StatCard icon={MapPinned} label="Kohdistetut kunnat" value={analysis.assignedCodes.size} detail={`${formatPercent(dataset.totalAreaKm2 ? assignedArea / dataset.totalAreaKm2 : 0)} pinta-alasta`} />
        <StatCard icon={MapIcon} label="Kohdistamattomat kunnat" value={analysis.unassigned.length} tone={analysis.unassigned.length ? 'warning' : undefined} detail={`${analysis.unassigned.reduce((sum, row) => sum + row.clubs.length, 0)} seuraa`} />
        <StatCard icon={Maximize2} label="Suurin alue" value={largest ? largest.region.name : '–'} detail={largest ? `${formatArea(largest.stats.areaKm2)} · ${formatPercent(largest.stats.areaShare)}` : undefined} />
        <StatCard icon={Minimize2} label="Pienin alue" value={smallest ? smallest.region.name : '–'} detail={smallest ? `${formatArea(smallest.stats.areaKm2)} · ${formatPercent(smallest.stats.areaShare)}` : undefined} />
        <StatCard icon={Scale} label="Varoituksia" value={warnings.filter((warning) => warning.severity === 'warning').length} tone={warnings.length ? 'warning' : undefined} detail={`${warnings.filter((warning) => warning.severity === 'info').length} huomiota`} />
      </div>
      <div className="chart-grid">
        <section className="planner-card"><BarChart title="Väestö 2025 alueittain" rows={[...active].filter(({ stats }) => stats.population !== null).sort((a, b) => (b.stats.population ?? 0) - (a.stats.population ?? 0)).map(({ region, stats }) => ({ id: region.id, label: label(region), value: stats.population ?? 0, color: region.color, display: formatCount(stats.population) }))} /></section>
        <section className="planner-card"><BarChart title="Jäseniä / 10 000 asukasta" rows={[...active].filter(({ stats }) => stats.membersPer10000 !== null).sort((a, b) => (b.stats.membersPer10000 ?? 0) - (a.stats.membersPer10000 ?? 0)).map(({ region, stats }) => ({ id: region.id, label: label(region), value: stats.membersPer10000 ?? 0, color: region.color, display: formatCount(stats.membersPer10000) }))} /><p className="hint">Väestö koskee koko aluetta; seuraluvut seuraavat suodatusta. Päällekkäisillä alueilla sama väestö näkyy kummassakin aluepalkissa.</p></section>
        <section className="planner-card"><BarChart title="Kattavuusjakauma: osuus Suomen pinta-alasta" rows={byArea.map(({ region, stats }) => ({ id: region.id, label: label(region), value: stats.areaShare * 100, color: region.color, display: formatPercent(stats.areaShare) }))} emptyText="Ei käytössä olevia alueita, joissa on kuntia." /></section>
        <section className="planner-card"><BarChart title="Jäsenet alueittain" rows={[...active].sort((a, b) => b.stats.members - a.stats.members).map(({ region, stats }) => ({ id: region.id, label: label(region), value: stats.members, color: region.color, display: integerFormat.format(stats.members) }))} /></section>
        <section className="planner-card"><BarChart title="Äänimäärä alueittain" rows={[...active].sort((a, b) => b.stats.votes - a.stats.votes).map(({ region, stats }) => ({ id: region.id, label: label(region), value: stats.votes, color: region.color, display: integerFormat.format(stats.votes) }))} /></section>
        <section className="planner-card"><BarChart title="Seuroja / 1 000 km²" rows={[...active].sort((a, b) => b.stats.clubsPerKm2 - a.stats.clubsPerKm2).map(({ region, stats }) => ({ id: region.id, label: label(region), value: stats.clubsPerKm2 * 1000, color: region.color }))} /></section>
      </div>
      <section className="planner-card">
        <header className="card-header"><div><h2>Suunnitelman tarkistukset</h2><p>Validointi päivittyy jokaisen muutoksen jälkeen.</p></div></header>
        <WarningList warnings={warnings} onSelectRegion={onSelectRegion} />
      </section>
    </div>
  );
}
