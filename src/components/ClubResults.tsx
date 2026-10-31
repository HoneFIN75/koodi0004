import { useState } from 'react';
import type { Club } from '../models/club';
import { formatCount, hasLocation } from '../services/mapService';

const pageSize = 12;

export function ClubResults({ clubs, selectedClub, onSelect }: { clubs: Club[]; selectedClub: Club | null; onSelect: (club: Club) => void }) {
  const [limit, setLimit] = useState(pageSize);
  return (
    <aside className="club-results" aria-label="Seuraluettelo">
      <div className="results-heading"><strong>SEURAT JÄSENMÄÄRITTÄIN</strong><span>{clubs.length}</span></div>
      {clubs.length === 0 ? <p className="empty-note">Ei suodattimia vastaavia seuroja. Muuta hakua tai tyhjennä suodattimet.</p> :
        clubs.slice(0, limit).map((club, index) => (
          <button className={`club-result ${selectedClub === club ? 'selected' : ''}`} key={index} onClick={() => onSelect(club)} aria-pressed={selectedClub === club}>
            <span className="club-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="club-name"><strong>{club.seura}</strong><small>{club.paikkakunta}{!hasLocation(club) && ' · Sijainti puuttuu'}</small></span>
            <span className="club-members">{formatCount(club.jasenmaara)}<small>jäsentä</small></span>
          </button>
        ))}
      {clubs.length > limit && <button className="show-all" onClick={() => setLimit((count) => count + pageSize)}>Näytä lisää seuroja <span>+{Math.min(pageSize, clubs.length - limit)}</span></button>}
    </aside>
  );
}
