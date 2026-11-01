import { useEffect, useRef } from 'react';
import { MapPin, X } from 'lucide-react';
import type { Club } from '../models/club';
import type { Municipality } from '../models/region';
import { getMunicipalityRank, getPopulationCategory, per10000Residents } from '../services/populationService';
import { formatCount, hasLocation, markerColor } from '../services/mapService';
import { MunicipalityCompetitionSummary } from './MunicipalityCompetitionSummary';

const labels: Record<string, string> = {
  district: 'Piiri', region: 'Alue', website: 'Verkkosivusto', email: 'Sähköposti', foundedYear: 'Perustamisvuosi',
  name: 'Yhteyshenkilö', phone: 'Puhelin', instagram: 'Instagram', tiktok: 'TikTok',
};

function detailLink(key: string, value: string | number): string | undefined {
  if (typeof value !== 'string') return;
  if (key === 'website' || key === 'instagram' || key === 'tiktok') {
    try {
      const url = new URL(value);
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
    } catch {
      // Malformed URLs remain visible as text, never executable links.
    }
  }
  if (key === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${encodeURIComponent(value)}`;
  if (key === 'phone') {
    const phone = value.replace(/[^\d+*#;,]/g, '');
    if (/\d/.test(phone)) return `tel:${phone}`;
  }
}

export function ClubDetail({ club, onClose, municipality }: { club: Club; onClose: () => void; municipality: Municipality | null }) {
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
      {club.contact && Object.entries(club.contact).some(([key, value]) => key !== 'public' && value !== '') && (
        <section className="detail-contact" aria-labelledby="club-contact-title">
          <h4 id="club-contact-title">Yhteystiedot</h4>
          <dl>
            {Object.entries(club.contact).filter(([key, value]) => key !== 'public' && value !== '').map(([key, value]) => {
              const href = detailLink(key, value);
              return <div key={key}><dt>{labels[key] ?? key}</dt><dd>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{value}</a> : value}</dd></div>;
            })}
          </dl>
        </section>
      )}
      <dl className="detail-fields">
        <div><dt>Väestökunta</dt><dd>{municipality?.name ?? 'Ei kohdistusta'}</dd></div>
        <div><dt>Kunnan väestö 2025</dt><dd>{formatCount(municipality?.population ?? null)}</dd></div>
        <div><dt>Väestöluokka</dt><dd>{getPopulationCategory(municipality?.population ?? null)?.label ?? 'Ei tietoa'}</dd></div>
        <div><dt>Väestösijoitus Suomessa</dt><dd>{municipality ? getMunicipalityRank(municipality.name) ?? 'Ei tietoa' : 'Ei tietoa'}</dd></div>
        <div><dt>Seuran jäseniä / 10 000 asukasta</dt><dd>{formatCount(per10000Residents(club.jasenmaara, municipality?.population ?? null))}</dd></div>
        {Object.entries(club.details).map(([key, value]) => {
          const href = detailLink(key, value);
          return <div key={key}><dt>{Object.hasOwn(labels, key) ? labels[key] : key}</dt><dd>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{value}</a> : value}</dd></div>;
        })}
        <div><dt>Koordinaatit</dt><dd>{hasLocation(club) ? `${club.latitude.toFixed(5)}, ${club.longitude.toFixed(5)}` : 'Sijaintitieto puuttuu'}</dd></div>
      </dl>
      <MunicipalityCompetitionSummary name={municipality?.name ?? club.paikkakunta} municipality={municipality} />
    </aside>
  );
}
