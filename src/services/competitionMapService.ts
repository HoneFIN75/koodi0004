import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import type { Competition } from '../models/competition';
import type { MunicipalityDataset } from '../models/region';
import { formatCompetitionDate, getCompetitionYearColor, getPrimaryMunicipality } from './competitionService.ts';
import { formatCompetitionDivision } from './competitionPresentation.ts';

export function competitionMarkerIcon(year: number | null): L.DivIcon {
  const color = year === null ? '#555555' : getCompetitionYearColor(year);
  return L.divIcon({
    className: 'competition-marker',
    iconSize: [44, 48], iconAnchor: [22, 24],
    html: `<svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="19" fill="white" stroke="#17212b" stroke-width="2"/><g stroke="#17212b" stroke-width="1.8" stroke-linejoin="round"><path d="M12 10h20v4H12zM14 26h16l-3 7H17z" fill="${color}"/><path d="M22 14v25M16 15l2 10m10-10-2 10m-7-10 1 10m5-10-1 10M17 39h10" fill="none"/><ellipse cx="32" cy="20" rx="5" ry="2" fill="${color}"/></g></svg><span>${year ?? '?'}</span>`,
  });
}

export function competitionPopup(competition: Competition, onSelect: (id: string) => void): HTMLElement {
  const root = document.createElement('div');
  root.className = 'competition-popup';
  const line = (text: string, strong = false) => {
    const node = document.createElement(strong ? 'strong' : 'p'); node.textContent = text; root.append(node);
  };
  line(`${competition.name} · kilpailuvuosi ${competition.year ?? 'puuttuu'}`, true);
  const primary = getPrimaryMunicipality(competition);
  line(`Ensisijainen kunta: ${primary?.name ?? 'Ei yksikäsitteistä kuntaa'}`);
  line(`Muut kunnat: ${competition.municipalities.filter((item) => item !== primary).map((item) => item.name).join(', ') || 'Ei muita kuntia'}`);
  for (const municipality of [...(primary ? [primary] : []), ...competition.municipalities.filter((item) => item !== primary)]) {
    line(`${municipality.name}: ${municipality.courses.join(', ') || 'Ratatietoja ei ole ilmoitettu'}${municipality.municipalityCode ? '' : ' · kohdistus puuttuu'}`);
  }
  line(`Järjestäjä: ${competition.organizer}`);
  line(`Kilpailumalli: ${competition.competitionModel} · PDGA-luokitus: ${competition.pdgaTier}`);
  line(`Luokkajako: ${formatCompetitionDivision(competition.divisionType)}`);
  line(`Ajankohta: ${formatCompetitionDate(competition.startDate)}–${formatCompetitionDate(competition.endDate)}`);
  if (competition.issues.length) line(`Aineiston huomautukset: ${competition.issues.join(' · ')}`);
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = 'Avaa kilpailun tiedot';
  button.onclick = () => onSelect(competition.id); root.append(button);
  return root;
}

export function competitionMarkerLocations(competitions: readonly Competition[], dataset: MunicipalityDataset) {
  return competitions.flatMap((competition) => {
    const primary = getPrimaryMunicipality(competition);
    const municipality = primary?.municipalityCode ? dataset.byCode.get(primary.municipalityCode) : null;
    return municipality ? [{ competition, municipality }] : [];
  });
}

export function competitionHighlightCodes(competition: Competition | null): string[] {
  return [...new Set(competition?.municipalities.flatMap((item) => item.municipalityCode ? [item.municipalityCode] : []) ?? [])];
}

export function addCompetitionMapLayer(map: L.Map, competitions: readonly Competition[], dataset: MunicipalityDataset, onSelect: (id: string) => void) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const group = L.markerClusterGroup({
    maxClusterRadius: 44, showCoverageOnHover: false, spiderfyOnMaxZoom: true, animate: !reducedMotion,
    removeOutsideVisibleBounds: true,
    iconCreateFunction(cluster) {
      const count = cluster.getChildCount();
      return L.divIcon({ className: 'competition-cluster', iconSize: [44, 44], html: `<span>${count}<small class="sr-only"> yksilöllistä kilpailua. Avaa kilpailuryhmä.</small></span>` });
    },
  });
  group.on('spiderfied', (event) => { event.cluster.getElement()?.setAttribute('tabindex', '-1'); event.cluster.getElement()?.setAttribute('aria-hidden', 'true'); });
  group.on('unspiderfied', (event) => { event.cluster.getElement()?.setAttribute('tabindex', '0'); event.cluster.getElement()?.removeAttribute('aria-hidden'); });
  const markers = new Map<string, L.Marker>();
  for (const { competition, municipality } of competitionMarkerLocations(competitions, dataset)) {
    const label = `${competition.name}, kilpailuvuosi ${competition.year ?? 'puuttuu'}, ensisijainen kunta ${municipality.name}, ${formatCompetitionDate(competition.startDate)}–${formatCompetitionDate(competition.endDate)}. Avaa kilpailun tiedot.`;
    const tooltip = document.createElement('span'); tooltip.textContent = label;
    const marker = L.marker([municipality.labelPoint[1], municipality.labelPoint[0]], {
      icon: competitionMarkerIcon(competition.year), keyboard: true, title: label, alt: label, riseOnHover: true,
    }).bindTooltip(tooltip, { direction: 'top', opacity: 1 }).bindPopup(competitionPopup(competition, onSelect));
    marker.on('click', () => onSelect(competition.id));
    marker.on('add', () => {
      const node = marker.getElement();
      node?.setAttribute('aria-label', label);
      if (node) node.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); marker.openPopup(); onSelect(competition.id); }
      };
    });
    markers.set(competition.id, marker);
  }
  group.addLayers([...markers.values()]).addTo(map);
  const highlight = L.layerGroup().addTo(map);
  let selectionVersion = 0;
  return {
    group, markers,
    select(competition: Competition | null) {
      const version = ++selectionVersion;
      highlight.clearLayers();
      for (const marker of markers.values()) marker.closePopup();
      if (!competition) return;
      for (const code of competitionHighlightCodes(competition)) {
        const municipality = dataset.byCode.get(code);
        if (!municipality) continue;
        const feature: GeoJSON.Feature = { type: 'Feature', properties: { competitionId: competition.id, code }, geometry: { type: 'MultiPolygon', coordinates: municipality.geometry.polygons } };
        L.geoJSON(feature, { interactive: false, style: { className: 'competition-highlight', color: '#17212b', weight: 3, dashArray: '5 4', fillColor: competition.year === null ? '#888888' : getCompetitionYearColor(competition.year), fillOpacity: 0.3 } }).addTo(highlight);
      }
      const marker = markers.get(competition.id);
      if (marker) group.zoomToShowLayer(marker, () => { if (version === selectionVersion) marker.openPopup(); });
    },
    remove() { selectionVersion++; group.clearLayers(); map.removeLayer(group); map.removeLayer(highlight); },
  };
}
