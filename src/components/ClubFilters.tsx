import type { ClubFilters as Filters } from '../services/searchService';
import { formatCount } from '../services/mapService';
import { PopulationFilters } from './PopulationFilters';

interface ClubFiltersProps {
  filters: Filters;
  maxMembers: number;
  votingOptions: number[];
  onChange: (filters: Filters) => void;
}

export function ClubFilters({ filters, maxMembers, votingOptions, onChange }: ClubFiltersProps) {
  const minimum = filters.minMembers ?? 0;
  const maximum = filters.maxMembers ?? maxMembers;

  return (
    <div className="filter-bar" aria-label="Seurojen suodattimet">
      <fieldset className="member-filter">
        <legend>Jäsenmäärä <strong>{formatCount(minimum)} – {formatCount(maximum)}</strong></legend>
        <label htmlFor="member-minimum">Vähintään
          <input id="member-minimum" type="range" min={0} max={maxMembers} step={1} value={minimum} aria-label="Jäsenmäärä vähintään"
            aria-valuetext={`Vähintään ${formatCount(minimum)} jäsentä`}
            onChange={(event) => {
              const value = Number(event.target.value);
              onChange({
                ...filters,
                minMembers: value === 0 ? null : value,
                maxMembers: value > maximum ? (value === maxMembers ? null : value) : filters.maxMembers,
              });
            }} />
        </label>
        <label htmlFor="member-maximum">Enintään
          <input id="member-maximum" type="range" min={0} max={maxMembers} step={1} value={maximum} aria-label="Jäsenmäärä enintään"
            aria-valuetext={`Enintään ${formatCount(maximum)} jäsentä`}
            onChange={(event) => {
              const value = Number(event.target.value);
              onChange({
                ...filters,
                minMembers: minimum > value ? (value === 0 ? null : value) : filters.minMembers,
                maxMembers: value === maxMembers ? null : value,
              });
            }} />
        </label>
      </fieldset>
      <div className="vote-filter">
        <label htmlFor="vote-filter">Äänivalta</label>
        <select id="vote-filter" value={filters.votes ?? 'all'} onChange={(event) => onChange({ ...filters, votes: event.target.value === 'all' ? null : Number(event.target.value) })}>
          <option value="all">Kaikki äänimäärät</option>
          {votingOptions.map((votes) => <option key={votes} value={votes}>{votes} ääntä</option>)}
        </select>
      </div>
      <button className="clear-filters" onClick={() => onChange({ query: '', minMembers: null, maxMembers: null, votes: null })}
        disabled={!filters.query && filters.minMembers === null && filters.maxMembers === null && filters.votes === null && filters.minPopulation == null && filters.maxPopulation == null && !filters.populationCategory}>Tyhjennä suodattimet</button>
      <PopulationFilters filters={filters} onChange={(next) => onChange({ ...filters, ...next })} />
    </div>
  );
}
