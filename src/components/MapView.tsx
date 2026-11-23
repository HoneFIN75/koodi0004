import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import type { Club } from '../models/club';
import type { MunicipalityDataset } from '../models/region';
import type { ProvinceDataset, ProvinceOverlaySettings } from '../models/province.ts';
import { formatCount, hasLocation, makePopup, markerColor, markerRadius } from '../services/mapService';
import { getCompetitionColor, getCompetitionCounts, getCompetitionMaximum } from '../services/competitionMapService.ts';
import { normalizeMunicipalityName } from '../services/populationService.ts';
import { createProvinceOverlay } from '../services/provinceOverlay.ts';
import { useCompetitionData } from '../state/useCompetitions.ts';
import { CompetitionLayerLegend } from './CompetitionLayerLegend.tsx';
import { MapLegend } from './MapLegend';
import { ProvinceOverlayControls } from './ProvinceOverlayControls';

interface MapViewProps {
  clubs: Club[];
  allClubs: Club[];
  selectedClub: Club | null;
  onSelect: (club: Club) => void;
  populationFor: (club: Club) => number | null;
  municipalities: MunicipalityDataset | null;
  provinces: ProvinceDataset | null;
  provinceSettings: ProvinceOverlaySettings;
  onProvinceSettingsChange: (settings: ProvinceOverlaySettings) => void;
  showCompetitions: boolean;
}

const finlandBounds: L.LatLngTuple[] = [[59.6, 19], [70.2, 32]];
const mapZoomOffset = 0.25;

function fitBoundsWithZoom(map: L.Map, bounds: L.LatLngBoundsExpression, options: L.FitBoundsOptions = {}, zoomOffset = mapZoomOffset) {
  map.fitBounds(bounds, options);
  map.setZoom(map.getZoom() + zoomOffset, { animate: options.animate });
}

function getMapZoomOffset(element: HTMLDivElement | null) {
  return element && element.clientWidth > 650 ? mapZoomOffset : 0;
}

function competitionTooltip(name: string, count: number): HTMLElement {
  const content = document.createElement('span');
  content.textContent = `${name}: ${formatCount(count)} kilpailuriviä`;
  return content;
}

export function MapView({ clubs, allClubs, selectedClub, onSelect, populationFor, municipalities, provinces, provinceSettings, onProvinceSettingsChange, showCompetitions }: MapViewProps) {
  const { index, yearFilter } = useCompetitionData();
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const cluster = useRef<L.MarkerClusterGroup | null>(null);
  const provinceOverlay = useRef<ReturnType<typeof createProvinceOverlay> | null>(null);
  const competitionLayer = useRef<L.GeoJSON | null>(null);
  const markers = useRef(new Map<Club, L.Marker>());
  const [tileError, setTileError] = useState(false);
  const reducedMotion = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const competitionCounts = useMemo(() => getCompetitionCounts(index, yearFilter), [index, yearFilter]);
  const competitionMaximum = getCompetitionMaximum(competitionCounts);
  const latestCompetitionCounts = useRef(competitionCounts);
  latestCompetitionCounts.current = competitionCounts;
  const effectiveProvinceSettings = showCompetitions ? { ...provinceSettings, showRegions: false } : provinceSettings;

  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current, {
      zoomControl: false, scrollWheelZoom: false, zoomSnap: 0.25,
      zoomAnimation: !reducedMotion.current,
      fadeAnimation: !reducedMotion.current,
      markerZoomAnimation: !reducedMotion.current,
    });
    fitBoundsWithZoom(instance, finlandBounds, { padding: [20, 20] }, getMapZoomOffset(element.current));
    L.control.zoom({ position: 'bottomright' }).addTo(instance);
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(instance);
    const competitionPane = instance.createPane('competitionLayer');
    competitionPane.style.zIndex = '410';
    tiles.on('tileerror', () => setTileError(true));
    const markerGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 48,
      animate: !reducedMotion.current,
      removeOutsideVisibleBounds: true,
      iconCreateFunction(group) {
        const count = group.getChildCount();
        return L.divIcon({
          html: `<span>${count}<small class="sr-only"> seuraa. Avaa ryhmä.</small></span>`,
          className: 'club-cluster',
          iconSize: [44, 44],
        });
      },
    }).addTo(instance);
    markerGroup.on('spiderfied', (event) => {
      event.cluster.getElement()?.setAttribute('tabindex', '-1');
      event.cluster.getElement()?.setAttribute('aria-hidden', 'true');
    });
    markerGroup.on('unspiderfied', (event) => {
      event.cluster.getElement()?.setAttribute('tabindex', '0');
      event.cluster.getElement()?.removeAttribute('aria-hidden');
    });
    map.current = instance;
    cluster.current = markerGroup;
    const resizeObserver = new ResizeObserver(() => instance.invalidateSize());
    resizeObserver.observe(element.current);
    return () => {
      resizeObserver.disconnect();
      instance.remove();
      map.current = null;
      cluster.current = null;
      competitionLayer.current = null;
      markers.current.clear();
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !municipalities) return;
    competitionLayer.current?.remove();
    const features: GeoJSON.Feature[] = municipalities.municipalities.map((municipality) => ({
      type: 'Feature',
      properties: { code: municipality.code, name: municipality.name },
      geometry: { type: 'MultiPolygon', coordinates: municipality.geometry.polygons },
    }));
    const layer = L.geoJSON({ type: 'FeatureCollection', features } as GeoJSON.FeatureCollection, {
      pane: 'competitionLayer',
      style: (feature) => {
        const name = String(feature?.properties?.name ?? '');
        const count = latestCompetitionCounts.current.get(normalizeMunicipalityName(name)) ?? 0;
        return {
          className: `competition-layer-municipality competition-layer-municipality-${String(feature?.properties?.code ?? '')}`,
          color: '#52635a',
          weight: 0.75,
          opacity: 0.8,
          fillColor: getCompetitionColor(count, getCompetitionMaximum(latestCompetitionCounts.current)),
          fillOpacity: 1,
        };
      },
      onEachFeature: (feature, municipalityLayer) => {
        if (!(municipalityLayer instanceof L.Path)) return;
        const name = String(feature.properties?.name ?? '');
        const count = latestCompetitionCounts.current.get(normalizeMunicipalityName(name)) ?? 0;
        municipalityLayer.bindTooltip(competitionTooltip(name, count), { sticky: true });
        municipalityLayer.on('add', () => {
          const node = municipalityLayer.getElement();
          if (!node) return;
          node.setAttribute('tabindex', '0');
          node.setAttribute('role', 'button');
          node.setAttribute('aria-label', `${name}, ${formatCount(latestCompetitionCounts.current.get(normalizeMunicipalityName(name)) ?? 0)} kilpailuriviä`);
          node.addEventListener('keydown', (event) => {
            const keyEvent = event as KeyboardEvent;
            if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
              keyEvent.preventDefault();
              municipalityLayer.openTooltip();
            }
          });
        });
      },
    });
    competitionLayer.current = layer;
    if (showCompetitions) layer.addTo(instance);
    return () => {
      layer.remove();
      if (competitionLayer.current === layer) competitionLayer.current = null;
    };
  }, [municipalities]);

  useEffect(() => {
    const layer = competitionLayer.current;
    if (!layer) return;
    layer.eachLayer((municipalityLayer) => {
      if (!(municipalityLayer instanceof L.Path)) return;
      const feature = (municipalityLayer as L.Path & { feature?: GeoJSON.Feature }).feature;
      const name = String(feature?.properties?.name ?? '');
      const count = competitionCounts.get(normalizeMunicipalityName(name)) ?? 0;
      municipalityLayer.setStyle({
        fillColor: getCompetitionColor(count, competitionMaximum),
        fillOpacity: 0.82,
      });
      municipalityLayer.getTooltip()?.setContent(competitionTooltip(name, count));
      municipalityLayer.getElement()?.setAttribute('aria-label', `${name}, ${formatCount(count)} kilpailuriviä`);
    });
  }, [competitionCounts, competitionMaximum]);

  useEffect(() => {
    const instance = map.current;
    const layer = competitionLayer.current;
    if (!instance || !layer) return;
    if (showCompetitions) layer.addTo(instance);
    else layer.remove();
  }, [showCompetitions, municipalities]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !municipalities || !provinces) return;
    provinceOverlay.current?.remove();
    const overlay = createProvinceOverlay(municipalities, provinces, effectiveProvinceSettings);
    provinceOverlay.current = overlay;
    if (effectiveProvinceSettings.showRegions) overlay.addTo(instance);
    return () => {
      overlay.remove();
      if (provinceOverlay.current === overlay) provinceOverlay.current = null;
    };
  }, [municipalities, provinces, showCompetitions]);

  useEffect(() => {
    const instance = map.current;
    const overlay = provinceOverlay.current;
    if (!instance || !overlay) return;
    overlay.updateSettings(effectiveProvinceSettings);
    if (effectiveProvinceSettings.showRegions) overlay.addTo(instance);
    else overlay.remove();
  }, [provinceSettings, showCompetitions]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const bounds = L.latLngBounds(finlandBounds);
    for (const club of allClubs) {
      if (hasLocation(club)) bounds.extend([club.latitude, club.longitude]);
    }
    fitBoundsWithZoom(instance, bounds, { padding: [24, 24], animate: false }, getMapZoomOffset(element.current));
  }, [allClubs]);

  useEffect(() => {
    const group = cluster.current;
    if (!group) return;
    for (const marker of markers.current.values()) marker.closeTooltip();
    group.clearLayers();
    markers.current.clear();
    const layers: L.Marker[] = [];
    for (const club of clubs) {
      if (!hasLocation(club)) continue;
      const diameter = markerRadius(club.jasenmaara) * 2;
      const marker = L.marker([club.latitude, club.longitude], {
        icon: L.divIcon({
          className: 'club-marker',
          html: `<span style="width:${diameter}px;height:${diameter}px;background:${markerColor(club.aanimaara)}"></span>`,
          iconSize: [Math.max(44, diameter), Math.max(44, diameter)],
          iconAnchor: [Math.max(44, diameter) / 2, Math.max(44, diameter) / 2],
        }),
        title: `${club.seura}, ${club.paikkakunta}: ${formatCount(club.jasenmaara)} jäsentä, ${formatCount(club.aanimaara)} ääntä. Avaa tiedot.`,
        alt: club.seura,
        keyboard: true,
      }).bindTooltip(makePopup(club, populationFor(club)), { direction: 'top', opacity: 1 });
      marker.on('click', () => onSelect(club));
      marker.on('add', () => {
        const node = marker.getElement();
        node?.setAttribute('aria-label', marker.options.title ?? club.seura);
        if (node) {
          node.onkeydown = (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              onSelect(club);
            }
          };
        }
      });
      markers.current.set(club, marker);
      layers.push(marker);
    }
    group.addLayers(layers);
  }, [clubs, onSelect, populationFor]);

  useEffect(() => {
    if (!selectedClub || !hasLocation(selectedClub) || !map.current) return;
    let active = true;
    const marker = markers.current.get(selectedClub);
    if (marker) cluster.current?.zoomToShowLayer(marker, () => {
      if (active && markers.current.get(selectedClub) === marker) marker.openTooltip();
    });
    return () => {
      active = false;
      marker?.closeTooltip();
    };
  }, [selectedClub, clubs]);

  return (
    <div className="map-frame">
      <ProvinceOverlayControls settings={provinceSettings} provinces={provinces} onChange={onProvinceSettingsChange} defaultOpen={false} choroplethActive={showCompetitions} />
      <div className="map-canvas" ref={element} aria-label="Suomen seurojen kartta. Liiku nuolinäppäimillä ja zoomaa plus- ja miinusnäppäimillä."
        onKeyDown={(event) => {
          if (event.key === 'Escape') for (const marker of markers.current.values()) marker.closeTooltip();
        }} />
      <button className="map-reset" onClick={() => map.current && fitBoundsWithZoom(map.current, finlandBounds, { padding: [24, 24], animate: !reducedMotion.current }, getMapZoomOffset(element.current))}>Näytä Suomi</button>
      {tileError && <p className="tile-error" role="status">Karttapohjan lataus epäonnistui. Seurat ovat silti käytettävissä luettelossa.</p>}
      <MapLegend />
      {showCompetitions && <CompetitionLayerLegend maximum={competitionMaximum} />}
    </div>
  );
}
