import { useMemo, useState } from 'react';
import type { ProvinceMetrics, ProvinceStatistics } from '../models/province.ts';

const numberFormat = new Intl.NumberFormat('fi-FI');
const decimalFormat = new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 1 });
const METRICS: { key: ProvinceMetrics; label: string; format: (value: number | null) => string }[] = [
  { key: 'clubs', label: 'Seuroja', format: (value) => numberFormat.format(value ?? 0) },
  { key: 'members', label: 'Jäseniä', format: (value) => numberFormat.format(value ?? 0) },
  { key: 'votes', label: 'Ääniä', format: (value) => numberFormat.format(value ?? 0) },
  { key: 'competitions', label: 'Kilpailuja', format: (value) => value === null ? 'Ei tietoa' : numberFormat.format(value) },
  { key: 'population', label: 'Väestö', format: (value) => value === null ? 'Ei tietoa' : numberFormat.format(value) },
  { key: 'municipalityCount', label: 'Kuntia', format: (value) => numberFormat.format(value ?? 0) },
  { key: 'competitionDensity', label: 'Kilpailuja / 1 000 km²', format: (value) => value === null ? 'Ei tietoa' : decimalFormat.format(value) },
  { key: 'populationDensity', label: 'Asukkaita / km²', format: (value) => value === null ? 'Ei tietoa' : decimalFormat.format(value) },
  { key: 'areaKm2', label: 'Pinta-ala (km²)', format: (value) => decimalFormat.format(value ?? 0) },
];

export function ProvinceComparison({ rows }: { rows: ProvinceStatistics[] }) {
  const [metric, setMetric] = useState<ProvinceMetrics>('members');
  const [direction, setDirection] = useState<'desc' | 'asc'>('desc');
  const [limit, setLimit] = useState('10');
  const [query, setQuery] = useState('');
  const currentMetric = METRICS.find((item) => item.key === metric)!;
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('fi-FI');
    return [...rows].filter((row) => row.province.name.toLocaleLowerCase('fi-FI').includes(needle))
      .sort((a, b) => {
        const left = a[metric]; const right = b[metric];
        if (left === null) return right === null ? a.province.name.localeCompare(b.province.name, 'fi') : 1;
        if (right === null) return -1;
        return (direction === 'desc' ? -1 : 1) * (left - right)
          || a.province.name.localeCompare(b.province.name, 'fi');
      }).slice(0, limit === 'all' ? undefined : Number(limit));
  }, [rows, metric, direction, limit, query]);

  return (
    <section className="panel province-comparison" aria-label="Maakuntavertailu">
      <div className="panel-heading"><div><h3>Maakuntavertailu</h3><p>Vertaa maakuntia valitulla mittarilla</p></div></div>
      <div className="province-comparison-controls">
        <label>Mittari<select value={metric} onChange={(event) => setMetric(event.target.value as ProvinceMetrics)}>
          {METRICS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select></label>
        <label>Järjestys<select value={direction} onChange={(event) => setDirection(event.target.value as 'asc' | 'desc')}>
          <option value="desc">Suurimmasta pienimpään</option><option value="asc">Pienimmästä suurimpaan</option>
        </select></label>
        <label>Näytä<select value={limit} onChange={(event) => setLimit(event.target.value)}>
          <option value="5">Top 5</option><option value="10">Top 10</option><option value="all">Kaikki</option>
        </select></label>
        <label className="province-search">Hae maakuntaa<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Maakunnan nimi" /></label>
      </div>
      <div className="ranking-list">
        {visible.map((row, index) => {
          const value = row[metric];
          const maximum = Math.max(...rows.map((entry) => entry[metric] ?? 0), 1);
          const percentage = value === null ? 0 : Math.min(100, Math.max(0, value / maximum * 100));
          return (
            <div className="ranking-row province-ranking-row" key={row.province.id}>
              <span className={`rank-number ${index < 3 ? 'rank-highlight' : ''}`}>{String(index + 1).padStart(2, '0')}</span>
              <div className="rank-name"><strong>{row.province.name}</strong><div className="province-rank-track" aria-hidden="true"><span style={{ width: `${percentage}%`, background: row.province.color }} /></div></div>
              <strong className="rank-value">{currentMetric.format(value)}</strong>
            </div>
          );
        })}
        {visible.length === 0 && <p className="empty-note">Haulla ei löytynyt maakuntia.</p>}
      </div>
    </section>
  );
}
