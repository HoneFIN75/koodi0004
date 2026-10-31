import type { Club, LocatedClub } from '../models/club';

export function hasLocation(club: Club): club is LocatedClub {
  return club.latitude !== null && club.longitude !== null;
}

export function markerRadius(members: number | null): number {
  return members === null ? 6 : 6 + 22 * Math.sqrt(Math.max(0, members) / (Math.max(0, members) + 300));
}

const colorStops = [
  { votes: 0, rgb: [30, 58, 138] },
  { votes: 10, rgb: [37, 99, 235] },
  { votes: 15, rgb: [245, 158, 11] },
  { votes: 20, rgb: [220, 38, 38] },
];

export function markerColor(votes: number | null): string {
  if (votes === null) return '#64748b';
  if (votes > 20) {
    const lightness = (129 / 255) * 100 - 25 * (1 - Math.exp(-(votes - 20) / 20));
    return `hsl(0 ${(182 / 252) * 100}% ${lightness}%)`;
  }
  const upper = colorStops.findIndex((stop) => stop.votes >= votes);
  const high = colorStops[Math.max(0, upper)];
  const low = colorStops[Math.max(0, upper - 1)];
  const ratio = high.votes === low.votes ? 0 : (Math.max(0, votes) - low.votes) / (high.votes - low.votes);
  return `#${high.rgb.map((channel, index) => Math.round(low.rgb[index] + (channel - low.rgb[index]) * ratio).toString(16).padStart(2, '0')).join('')}`;
}

export function formatCount(value: number | null): string {
  return value === null ? 'Ei tietoa' : value.toLocaleString('fi-FI', { maximumFractionDigits: 1 });
}

export function makePopup(club: Club): HTMLElement {
  const content = document.createElement('div');
  content.className = 'map-popup';
  const title = document.createElement('strong');
  title.textContent = club.seura;
  const municipality = document.createElement('span');
  municipality.textContent = club.paikkakunta;
  const stats = document.createElement('span');
  stats.textContent = `Jäseniä: ${formatCount(club.jasenmaara)} · Ääniä: ${formatCount(club.aanimaara)}`;
  content.append(title, municipality, stats);
  return content;
}
