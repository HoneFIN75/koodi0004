import type { ClubFilters as Filters } from '../services/searchService';
import { formatCount } from '../services/mapService';

interface ClubFiltersProps {
  filters: Filters;
  maxMembers: number;
  votingOptions: number[];
  onChange: (filters: Filters) => void;
}

export function ClubFilters({ filters, maxMembers, votingOptions, onChange }: ClubFiltersProps) {
  return (
    <div className="filter-bar" aria-label="Seurojen suodattimet">
      <label className="member-filter" htmlFor="member-limit">
        <span>Jäsenmäärä <strong>0 – {formatCount(filters.maxMembers ?? maxMembers)}</strong></span>
        <input id="member-limit" type="range" min={0} max={maxMembers} step={1}
          value={filters.maxMembers ?? maxMembers}
          aria-valuetext={`0–${formatCount(filters.maxMembers ?? maxMembers)} jäsentä`}
          onChange={(event) => onChange({ ...filters, maxMembers: Number(event.target.value) === maxMembers ? null : Number(event.target.value) })} />
      </label>
      <div className="vote-filter">
        <label htmlFor="vote-filter">Äänivalta</label>
        <select id="vote-filter" value={filters.votes ?? 'all'} onChange={(event) => onChange({ ...filters, votes: event.target.value === 'all' ? null : Number(event.target.value) })}>
          <option value="all">Kaikki äänimäärät</option>
          {votingOptions.map((votes) => <option key={votes} value={votes}>{votes} ääntä</option>)}
        </select>
      </div>
      <button className="clear-filters" onClick={() => onChange({ query: '', maxMembers: null, votes: null })}
        disabled={!filters.query && filters.maxMembers === null && filters.votes === null}>Tyhjennä suodattimet</button>
    </div>
  );
}
