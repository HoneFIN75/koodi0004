import type React from 'react';
import { RotateCcw } from 'lucide-react';
import type { Region } from '../../models/region';
import { emptyFilters, type PlannerFilters as Filters } from '../../services/regionAnalytics';

interface PlannerFiltersProps {
  filters: Filters;
  regions: Region[];
  maxMembers: number;
  votingOptions: number[];
  onChange: (filters: Filters) => void;
}

export function PlannerFilters({ filters, regions, maxMembers, votingOptions, onChange }: PlannerFiltersProps) {
  const active = JSON.stringify(filters) !== JSON.stringify(emptyFilters);
  const upper = filters.maxMembers ?? maxMembers;
  const toggleRegion = (id: string) => onChange({ ...filters, regionIds: filters.regionIds.includes(id) ? filters.regionIds.filter((item) => item !== id) : [...filters.regionIds, id] });
  return (
    <details className="planner-card filters-card" open>
      <summary><h2>Suodattimet</h2>{active && <span className="pill">käytössä</span>}</summary>
      <div className="filter-grid">
        <label className="field">Seuran nimi<input type="search" value={filters.clubQuery} onChange={(event) => onChange({ ...filters, clubQuery: event.target.value })} placeholder="Hae seuraa…" /></label>
        <label className="field">Kunta<input type="search" value={filters.municipalityQuery} onChange={(event) => onChange({ ...filters, municipalityQuery: event.target.value })} placeholder="Hae kuntaa…" /></label>
        <fieldset className="field range-pair">
          <legend>Jäsenmäärä {filters.minMembers}–{upper}</legend>
          <label><span className="sr-only">Vähintään</span><input type="range" min={0} max={maxMembers} value={Math.min(filters.minMembers, upper)} onChange={(event) => onChange({ ...filters, minMembers: Math.min(Number(event.target.value), upper) })} aria-label="Jäsenmäärä vähintään" /></label>
          <label><span className="sr-only">Enintään</span><input type="range" min={0} max={maxMembers} value={upper} onChange={(event) => { const value = Number(event.target.value); onChange({ ...filters, maxMembers: value >= maxMembers ? null : Math.max(value, filters.minMembers) }); }} aria-label="Jäsenmäärä enintään" /></label>
        </fieldset>
        <label className="field">Äänimäärä
          <select value={filters.votes ?? ''} onChange={(event) => onChange({ ...filters, votes: event.target.value === '' ? null : Number(event.target.value) })}>
            <option value="">Kaikki</option>
            {votingOptions.map((votes) => <option key={votes} value={votes}>{votes} ääntä</option>)}
          </select>
        </label>
        {regions.length > 0 && (
          <fieldset className="field region-filter">
            <legend>Alueet {filters.regionIds.length > 0 ? `(${filters.regionIds.length})` : '(kaikki)'}</legend>
            <div className="chip-toggle-list">
              {[...regions].sort((a, b) => a.number - b.number).map((region) => (
                <button key={region.id} type="button" className="chip-toggle" aria-pressed={filters.regionIds.includes(region.id)} onClick={() => toggleRegion(region.id)} style={{ '--chip-color': region.color } as React.CSSProperties}>
                  {region.number} {region.shortName}
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </div>
      {active && <button type="button" className="text-button" onClick={() => onChange(emptyFilters)}><RotateCcw size={14} /> Tyhjennä suodattimet</button>}
    </details>
  );
}
