import { populationCategories, type PopulationFilters as Filters } from '../services/populationService';

export function PopulationFilters({ filters, onChange }: { filters: Filters; onChange: (filters: Filters) => void }) {
  return <fieldset className="population-filters">
    <legend>Kunnan väestö 2025</legend>
    <label>Vähintään<input type="number" min={0} step={1} value={filters.minPopulation ?? ''} onChange={(event) => onChange({ ...filters, minPopulation: event.target.value === '' ? null : Math.max(0, Math.floor(Number(event.target.value))) })} /></label>
    <label>Enintään<input type="number" min={0} step={1} value={filters.maxPopulation ?? ''} onChange={(event) => onChange({ ...filters, maxPopulation: event.target.value === '' ? null : Math.max(0, Math.floor(Number(event.target.value))) })} /></label>
    <label>Väestöluokka<select value={filters.populationCategory ?? ''} onChange={(event) => onChange({ ...filters, populationCategory: populationCategories.find((item) => item.id === event.target.value)?.id ?? '' })}>
      <option value="">Kaikki</option>{populationCategories.map((item) => <option key={item.id} value={item.id}>{item.label} (≥ {item.min.toLocaleString('fi-FI')})</option>)}
    </select></label>
    {filters.minPopulation != null && filters.maxPopulation != null && filters.minPopulation > filters.maxPopulation && <p role="alert">Vähimmäisväestö on enimmäisväestöä suurempi. Yhtään kuntaa ei vastaa rajausta.</p>}
  </fieldset>;
}
