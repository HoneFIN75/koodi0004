import type { MunicipalityStat } from '../models/club';

interface RankingCardProps {
  title: string;
  description: string;
  rows: MunicipalityStat[];
  valueLabel: string;
  limit?: number;
  showClubCount?: boolean;
}

export function RankingCard({ title, description, rows, valueLabel, limit = 10, showClubCount = true }: RankingCardProps) {
  return (
    <section className="panel ranking-card">
      <div className="panel-heading">
        <div><h3>{title}</h3><p>{description}</p></div>
        <span className="panel-tag">TOP {limit}</span>
      </div>
      <div className="ranking-list">
        {rows.slice(0, limit).map((row, index) => (
          <div className="ranking-row" key={`${row.name}-${index}`}>
            <span className={`rank-number ${index < 3 ? 'rank-highlight' : ''}`}>{String(index + 1).padStart(2, '0')}</span>
            <div className="rank-name"><strong>{row.name}</strong>{showClubCount && <span>{row.clubs} seuraa</span>}</div>
            <strong className="rank-value">{row.members.toLocaleString('fi-FI')} <small>{valueLabel}</small></strong>
          </div>
        ))}
        {rows.length === 0 && <p className="empty-note">Ei tilastoitavaa aineistoa.</p>}
      </div>
    </section>
  );
}
