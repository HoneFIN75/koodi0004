import type { Club } from '../models/club';

export function markerRadius(members: number): number {
  return Math.max(5, Math.min(18, 5 + Math.sqrt(members) * 0.62));
}

export function markerColor(votes: number): string {
  if (votes >= 20) return '#f08c62';
  if (votes >= 15) return '#ddb84d';
  return '#72bd83';
}

export function makePopup(club: Club): HTMLElement {
  const content = document.createElement('div');
  content.className = 'map-popup';
  const title = document.createElement('strong');
  title.textContent = club.seura;
  const municipality = document.createElement('span');
  municipality.textContent = club.paikkakunta;
  const stats = document.createElement('span');
  stats.textContent = `${club.jasenmaara.toLocaleString('fi-FI')} jäsentä · ${club.aanimaara} ääntä`;
  content.append(title, municipality, stats);
  return content;
}
