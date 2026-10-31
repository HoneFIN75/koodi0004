import type { DistributionStat } from '../models/club';

interface ChartCardProps {
  title: string;
  description: string;
  rows: DistributionStat[];
  color?: string;
}

export function ChartCard({ title, description, rows, color = 'var(--accent)' }: ChartCardProps) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <section className="panel chart-card">
      <div className="panel-heading">
        <div><h3>{title}</h3><p>{description}</p></div>
      </div>
      <div className="bar-list">
        {rows.map((row) => (
          <div className="bar-row" key={row.label}>
            <span className="bar-label">{row.label}</span>
            <div className="bar-track" aria-hidden="true"><span style={{ width: `${(row.count / max) * 100}%`, background: color, minWidth: row.count === 0 ? 0 : undefined }} /></div>
            <span className="bar-value">{row.count}</span>
          </div>
        ))}
        {rows.length === 0 && <p className="empty-note">Ei tilastoitavaa aineistoa.</p>}
      </div>
    </section>
  );
}
