import type { CSSProperties } from 'react';
import { Copy, Pencil, X } from 'lucide-react';
import type { Region } from '../../models/region';
import { formatArea, formatDensity, formatPercent, type RegionStats } from '../../services/regionAnalytics';
import type { ValidationWarning } from '../../services/validationService';
import { StatCard, WarningList, decimalFormat, integerFormat } from './ui';

interface RegionDetailProps {
  region: Region;
  stats: RegionStats;
  explanation: string;
  warnings: ValidationWarning[];
  onEdit: () => void;
  onDuplicate: () => void;
  onClose: () => void;
}

export function RegionDetail({ region, stats, explanation, warnings, onEdit, onDuplicate, onClose }: RegionDetailProps) {
  return (
    <section className="planner-card region-detail" aria-labelledby="region-detail-title" style={{ '--region-color': region.color } as CSSProperties}>
      <header className="card-header">
        <div className="detail-title">
          <span className="region-number large" style={{ background: region.color }}>{region.number}</span>
          <div><h2 id="region-detail-title">{region.name}</h2><p>{region.shortName}{region.enabled ? '' : ' · pois käytöstä'}{region.visible ? '' : ' · piilotettu'}</p></div>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Sulje aluepaneeli"><X size={17} /></button>
      </header>
      {region.description && <p className="region-description">{region.description}</p>}
      <div className="button-row">
        <button type="button" className="primary-button" onClick={onEdit}><Pencil size={15} /> Muokkaa ja valitse kunnat</button>
        <button type="button" className="secondary-button" onClick={onDuplicate}><Copy size={15} /> Monista</button>
      </div>
      <div className="stat-grid compact">
        <StatCard label="Kuntia" value={stats.municipalityCount} />
        <StatCard label="Seuroja" value={stats.clubCount} />
        <StatCard label="Jäseniä" value={integerFormat.format(stats.members)} />
        <StatCard label="Äänimäärä" value={integerFormat.format(stats.votes)} />
        <StatCard label="Pinta-ala" value={formatArea(stats.areaKm2)} />
        <StatCard label="Osuus Suomesta" value={formatPercent(stats.areaShare)} />
        <StatCard label="Keskikoko" value={stats.averageMembers === null ? '–' : `${decimalFormat.format(stats.averageMembers)} jäs.`} />
        <StatCard label="Väestö" value={stats.population === null ? 'Ei saatavilla' : integerFormat.format(stats.population)} />
        <StatCard label="Seuratiheys" value={formatDensity(stats.clubsPerKm2)} />
        <StatCard label="Jäsentiheys" value={formatDensity(stats.membersPerKm2)} />
      </div>
      <dl className="extremes">
        <div><dt>Suurin seura</dt><dd>{stats.largestClub ? `${stats.largestClub.seura} (${stats.largestClub.jasenmaara})` : '–'}</dd></div>
        <div><dt>Pienin seura</dt><dd>{stats.smallestClub ? `${stats.smallestClub.seura} (${stats.smallestClub.jasenmaara})` : '–'}</dd></div>
      </dl>
      <h3>Maantieteellinen kattavuus</h3>
      <p className="coverage-text">{explanation}</p>
      <h3>Tarkistukset</h3>
      <WarningList warnings={warnings} emptyText="Alueessa ei ole huomautettavaa." />
      <details className="detail-list" open={stats.municipalityCount <= 15}>
        <summary>Kunnat ({stats.municipalityCount})</summary>
        <ul className="chip-list">{stats.municipalities.map((municipality) => <li key={municipality.code}>{municipality.name}</li>)}</ul>
        {stats.missingCodes.length > 0 && <p className="field-error">Tuntemattomat kuntakoodit: {stats.missingCodes.join(', ')}</p>}
      </details>
      <details className="detail-list" open={stats.clubCount > 0 && stats.clubCount <= 12}>
        <summary>Seurat ({stats.clubCount})</summary>
        <table className="data-table compact">
          <thead><tr><th scope="col">Seura</th><th scope="col">Kunta</th><th scope="col" className="numeric">Jäseniä</th><th scope="col" className="numeric">Ääniä</th></tr></thead>
          <tbody>{stats.clubs.map((club, index) => <tr key={`${club.seura}-${index}`}><td>{club.seura}</td><td>{club.paikkakunta}</td><td className="numeric">{club.jasenmaara ?? '–'}</td><td className="numeric">{club.aanimaara ?? '–'}</td></tr>)}</tbody>
        </table>
      </details>
    </section>
  );
}
