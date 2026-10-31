import { Copy, Eye, EyeOff, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import type { Region } from '../../models/region';
import type { RegionStats } from '../../services/regionAnalytics';
import { integerFormat } from './ui';
import { formatCount } from '../../services/mapService';
import type { CompetitionContext } from '../../state/useCompetitions';

interface RegionListProps {
  regions: Region[];
  stats: Map<string, RegionStats>;
  selectedRegionId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (region: Region) => void;
  onToggle: (region: Region, field: 'enabled' | 'visible') => void;
  readOnly?: boolean;
  competitions: CompetitionContext;
}

export function RegionList({ regions, stats, selectedRegionId, onSelect, onCreate, onEdit, onDuplicate, onDelete, onToggle, readOnly = false, competitions }: RegionListProps) {
  const sorted = [...regions].sort((a, b) => a.number - b.number || a.name.localeCompare(b.name, 'fi'));
  return (
    <section className="planner-card region-list" aria-labelledby="region-list-title">
      <header className="card-header">
        <div><h2 id="region-list-title">Alueet</h2><p>{regions.length} aluetta · {regions.filter((region) => region.enabled).length} käytössä</p></div>
        {!readOnly && <button type="button" className="primary-button" onClick={onCreate}><Plus size={16} /> Uusi alue</button>}
      </header>
      {regions.length === 0 && <p className="empty-text">Tässä skenaariossa ei ole vielä alueita. Luo ensimmäinen alue ja valitse sille kunnat kartalta tai luettelosta.</p>}
      <ul>
        {sorted.map((region) => {
          const regionStats = stats.get(region.id);
          return (
            <li key={region.id} className={`region-row${region.id === selectedRegionId ? ' selected' : ''}${region.enabled ? '' : ' disabled'}`}>
              <button type="button" className="region-row-main" onClick={() => onSelect(region.id)} aria-current={region.id === selectedRegionId ? 'true' : undefined}>
                <span className="region-number" style={{ background: region.color }}>{region.number}</span>
                <span className="region-row-text">
                  <strong>{region.name}</strong>
                  <small>{region.shortName} · {regionStats?.municipalityCount ?? 0} kuntaa · {regionStats?.clubCount ?? 0} seuraa · {integerFormat.format(regionStats?.members ?? 0)} jäsentä</small>
                  <small>Väestö 2025: {formatCount(regionStats?.population ?? null)} asukasta</small>
                  <small>{competitions.filters.visibility === 'hidden' ? 'Kilpailut piilotettu' : `Ensisijaiset kilpailut (suodatettu): ${competitions.analysis?.regionCounts.get(region.id) ?? 0}`}</small>
                </span>
              </button>
              {!readOnly && <span className="row-actions">
                <button type="button" className="icon-button" onClick={() => onToggle(region, 'visible')} aria-pressed={region.visible} aria-label={`${region.visible ? 'Piilota' : 'Näytä'} alue ${region.name}`} title={region.visible ? 'Piilota kartalta' : 'Näytä kartalla'}>{region.visible ? <Eye size={15} /> : <EyeOff size={15} />}</button>
                <button type="button" className="icon-button" onClick={() => onToggle(region, 'enabled')} aria-pressed={region.enabled} aria-label={`${region.enabled ? 'Poista käytöstä' : 'Ota käyttöön'} alue ${region.name}`} title={region.enabled ? 'Poista käytöstä' : 'Ota käyttöön'}><Power size={15} /></button>
                <button type="button" className="icon-button" onClick={() => onEdit(region.id)} aria-label={`Muokkaa aluetta ${region.name}`} title="Muokkaa"><Pencil size={15} /></button>
                <button type="button" className="icon-button" onClick={() => onDuplicate(region.id)} aria-label={`Monista alue ${region.name}`} title="Monista"><Copy size={15} /></button>
                <button type="button" className="icon-button danger" onClick={() => onDelete(region)} aria-label={`Poista alue ${region.name}`} title="Poista"><Trash2 size={15} /></button>
              </span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
