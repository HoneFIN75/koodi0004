import type { ReactNode } from 'react';
import { AlertTriangle, Info, type LucideIcon } from 'lucide-react';
import type { SaveStatus } from '../../models/region';
import type { ValidationWarning } from '../../services/validationService';

export const integerFormat = new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 0 });
export const decimalFormat = new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 1 });

export function StatCard({ icon: Icon, label, value, detail, tone }: { icon?: LucideIcon; label: string; value: ReactNode; detail?: ReactNode; tone?: 'warning' }) {
  return (
    <article className={`stat-card${tone ? ` ${tone}` : ''}`}>
      {Icon && <span className="stat-icon" aria-hidden="true"><Icon size={17} /></span>}
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {detail && <span className="stat-detail">{detail}</span>}
    </article>
  );
}

export interface BarDatum { id: string; label: string; value: number; color?: string; display?: string }

export function BarChart({ title, rows, unit, emptyText = 'Ei vertailtavaa aineistoa.' }: { title: string; rows: BarDatum[]; unit?: string; emptyText?: string }) {
  const maximum = Math.max(...rows.map((row) => row.value), 0);
  return (
    <figure className="bar-chart" aria-label={title}>
      <figcaption>{title}</figcaption>
      {rows.length === 0 && <p className="muted">{emptyText}</p>}
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <span className="bar-chart-label" title={row.label}>{row.label}</span>
            <span className="bar-chart-track" aria-hidden="true"><span style={{ width: `${maximum > 0 ? Math.max(1, (row.value / maximum) * 100) : 0}%`, background: row.color ?? 'var(--accent)' }} /></span>
            <span className="bar-chart-value">{row.display ?? `${decimalFormat.format(row.value)}${unit ? ` ${unit}` : ''}`}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function WarningList({ warnings, emptyText = 'Ei huomautettavaa. Suunnitelma läpäisee kaikki tarkistukset.', onSelectRegion }: { warnings: ValidationWarning[]; emptyText?: string; onSelectRegion?: (id: string) => void }) {
  if (warnings.length === 0) return <p className="validation-ok" role="status">✓ {emptyText}</p>;
  return (
    <ul className="warning-list">
      {warnings.map((warning) => (
        <li key={warning.id} className={warning.severity}>
          {warning.severity === 'warning' ? <AlertTriangle size={15} aria-label="Varoitus" /> : <Info size={15} aria-label="Huomio" />}
          {warning.regionId && onSelectRegion
            ? <button type="button" className="link-button" onClick={() => onSelectRegion(warning.regionId!)}>{warning.message}</button>
            : <span>{warning.message}</span>}
        </li>
      ))}
    </ul>
  );
}

const saveLabels: Record<SaveStatus, string> = { saved: 'Tallennettu', saving: 'Tallennetaan…', unsaved: 'Tallentamattomia muutoksia', error: 'Tallennus epäonnistui' };

export function SaveIndicator({ status, storage, lastSavedAt }: { status: SaveStatus; storage: string | null; lastSavedAt: string | null }) {
  const title = `${saveLabels[status]}${storage ? ` · ${storage}` : ''}${lastSavedAt ? ` · ${new Date(lastSavedAt).toLocaleTimeString('fi-FI')}` : ''}`;
  return <span className={`save-indicator ${status}`} role="status" aria-live="polite" title={title}><span aria-hidden="true">●</span> {saveLabels[status]}</span>;
}

export function ColorDot({ color }: { color: string }) {
  return <span className="color-dot" style={{ background: color }} aria-hidden="true" />;
}
