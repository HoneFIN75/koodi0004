import { useEffect, useRef } from 'react';
import { MapPin, X } from 'lucide-react';
import type { Club } from '../models/club';
import { formatCount, hasLocation, markerColor } from '../services/mapService';

const labels: Record<string, string> = {
  district: 'Piiri', region: 'Alue', website: 'Verkkosivusto', email: 'Sähköposti', foundedYear: 'Perustamisvuosi',
};

function detailLink(key: string, value: string | number): string | undefined {
  if (typeof value !== 'string') return;
  if (key === 'website') {
    try {
      const url = new URL(value);
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
    } catch {
      // Malformed URLs remain visible as text, never executable links.
    }
  }
  if (key === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${encodeURIComponent(value)}`;
}

export function ClubDetail({ club, onClose }: { club: Club; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      requestAnimationFrame(() => {
        if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
      });
    };
  }, [club]);

  return (
    <aside className="club-detail" aria-labelledby="club-detail-title" onKeyDown={(event) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    }}>
      <div className="detail-heading"><span>SEURAN TIEDOT</span><button ref={closeButton} onClick={onClose} aria-label="Sulje seuran tiedot"><X size={20} /></button></div>
      <div className="detail-emblem" style={{ borderColor: markerColor(club.aanimaara) }}><MapPin size={25} /></div>
      <h3 id="club-detail-title">{club.seura}</h3>
      <p className="detail-town"><MapPin size={14} />{club.paikkakunta}</p>
      <dl className="detail-stats">
        <div><dt>Jäseniä</dt><dd>{formatCount(club.jasenmaara)}</dd></div>
        <div><dt>Äänivalta</dt><dd>{formatCount(club.aanimaara)}{club.aanimaara !== null && <small> ääntä</small>}</dd></div>
      </dl>
      <dl className="detail-fields">
        {Object.entries(club.details).map(([key, value]) => {
          const href = detailLink(key, value);
          return <div key={key}><dt>{Object.hasOwn(labels, key) ? labels[key] : key}</dt><dd>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{value}</a> : value}</dd></div>;
        })}
        <div><dt>Koordinaatit</dt><dd>{hasLocation(club) ? `${club.latitude.toFixed(5)}, ${club.longitude.toFixed(5)}` : 'Sijaintitieto puuttuu'}</dd></div>
      </dl>
    </aside>
  );
}
