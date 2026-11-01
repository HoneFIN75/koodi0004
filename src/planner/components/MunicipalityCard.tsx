import { useState } from 'react';
import { X } from 'lucide-react';
import type { Municipality, Region } from '../../models/region';
import { formatArea, type MunicipalityAggregate } from '../../services/regionAnalytics';
import { formatCount } from '../../services/mapService';
import { getMunicipalityRank, getNationalPopulation, getPopulationCategory, per10000Residents } from '../../services/populationService';
import { MunicipalityCompetitionSummary } from '../../components/MunicipalityCompetitionSummary';

interface MunicipalityCardProps {
  municipality: Municipality;
  aggregate: MunicipalityAggregate | undefined;
  regions: Region[];
  memberOf: Region[];
  onAdd: (regionId: string) => void;
  onRemove: (regionId: string) => void;
  onSelectRegion: (regionId: string) => void;
  onClose: () => void;
  readOnly?: boolean;
}

export function MunicipalityCard({ municipality, aggregate, regions, memberOf, onAdd, onRemove, onSelectRegion, onClose, readOnly = false }: MunicipalityCardProps) {
  const candidates = regions.filter((region) => !memberOf.some((member) => member.id === region.id));
  const [target, setTarget] = useState('');
  return (
    <section className="planner-card" aria-labelledby="municipality-card-title">
      <header className="card-header">
        <div><h2 id="municipality-card-title">{municipality.name}</h2><p>{[municipality.nameSv !== municipality.name ? municipality.nameSv : null, municipality.province, formatArea(municipality.areaKm2)].filter(Boolean).join(' · ')}</p></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Sulje kuntatiedot"><X size={17} /></button>
      </header>
      <p className="hint">{aggregate?.clubs.length ?? 0} seuraa · {aggregate?.members ?? 0} jäsentä · {aggregate?.votes ?? 0} ääntä</p>
      <dl className="extremes">
        <div><dt>Väestö 2025</dt><dd>{formatCount(municipality.population)}</dd></div>
        <div><dt>Väestösijoitus Suomessa</dt><dd>{getMunicipalityRank(municipality.name) ?? 'Ei tietoa'}</dd></div>
        <div><dt>Väestöluokka</dt><dd>{getPopulationCategory(municipality.population)?.label ?? 'Ei tietoa'}</dd></div>
        <div><dt>Osuus Suomen väestöstä</dt><dd>{municipality.population !== null ? `${(municipality.population / getNationalPopulation() * 100).toLocaleString('fi-FI', { maximumFractionDigits: 2 })} %` : 'Ei tietoa'}</dd></div>
        <div><dt>Asukkaita / km²</dt><dd>{municipality.population !== null && municipality.areaKm2 > 0 ? formatCount(municipality.population / municipality.areaKm2) : 'Ei tietoa'}</dd></div>
        <div><dt>Seuroja / 10 000 asukasta</dt><dd>{formatCount(per10000Residents(aggregate?.clubs.length ?? 0, municipality.population))}</dd></div>
      </dl>
      <MunicipalityCompetitionSummary name={municipality.name} municipality={municipality} />
      <h3>Alueet</h3>
      {memberOf.length === 0 && <p className="empty-text">Kunta ei kuulu mihinkään alueeseen.</p>}
      <ul className="membership-list">
        {memberOf.map((region) => (
          <li key={region.id}>
            <button type="button" className="link-button" onClick={() => onSelectRegion(region.id)}><span className="region-number small" style={{ background: region.color }}>{region.number}</span> {region.name}</button>
            {!readOnly && <button type="button" className="text-button" onClick={() => onRemove(region.id)} aria-label={`Poista ${municipality.name} alueesta ${region.name}`}>Poista</button>}
          </li>
        ))}
      </ul>
      {!readOnly && candidates.length > 0 && (
        <div className="inline-form">
          <select value={target} onChange={(event) => setTarget(event.target.value)} aria-label="Valitse alue, johon kunta lisätään">
            <option value="">Lisää alueeseen…</option>
            {candidates.map((region) => <option key={region.id} value={region.id}>{region.number} {region.name}</option>)}
          </select>
          <button type="button" className="primary-button" disabled={!target} onClick={() => { onAdd(target); setTarget(''); }}>Lisää</button>
        </div>
      )}
      {aggregate && aggregate.clubs.length > 0 && (
        <>
          <h3>Seurat</h3>
          <ul className="plain-list">{aggregate.clubs.map((club, index) => <li key={`${club.seura}-${index}`}>{club.seura} <small>{club.jasenmaara ?? '–'} jäs. · {club.aanimaara ?? '–'} ääntä</small></li>)}</ul>
        </>
      )}
    </section>
  );
}
