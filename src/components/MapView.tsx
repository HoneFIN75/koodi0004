import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import type { Club } from '../models/club';
import { formatCount, hasLocation, makePopup, markerColor, markerRadius } from '../services/mapService';
import { MapLegend } from './MapLegend';

interface MapViewProps {
  clubs: Club[];
  allClubs: Club[];
  selectedClub: Club | null;
  onSelect: (club: Club) => void;
  populationFor: (club: Club) => number | null;
}

const finlandBounds: L.LatLngTuple[] = [[59.6, 19], [70.2, 32]];

export function MapView({ clubs, allClubs, selectedClub, onSelect, populationFor }: MapViewProps) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const cluster = useRef<L.MarkerClusterGroup | null>(null);
  const markers = useRef(new Map<Club, L.Marker>());
  const [tileError, setTileError] = useState(false);
  const reducedMotion = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current, {
      zoomControl: false, scrollWheelZoom: false,
      zoomAnimation: !reducedMotion.current,
      fadeAnimation: !reducedMotion.current,
      markerZoomAnimation: !reducedMotion.current,
    });
    instance.fitBounds(finlandBounds, { padding: [20, 20] });
    L.control.zoom({ position: 'bottomright' }).addTo(instance);
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(instance);
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
      markers.current.clear();
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const bounds = L.latLngBounds(finlandBounds);
    for (const club of allClubs) {
      if (hasLocation(club)) bounds.extend([club.latitude, club.longitude]);
    }
    instance.fitBounds(bounds, { padding: [24, 24], animate: false });
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
      <div className="map-canvas" ref={element} aria-label="Suomen seurojen kartta. Liiku nuolinäppäimillä ja zoomaa plus- ja miinusnäppäimillä."
        onKeyDown={(event) => {
          if (event.key === 'Escape') for (const marker of markers.current.values()) marker.closeTooltip();
        }} />
      <button className="map-reset" onClick={() => map.current?.fitBounds(finlandBounds, { animate: !reducedMotion.current })}>Näytä Suomi</button>
      {tileError && <p className="tile-error" role="status">Karttapohjan lataus epäonnistui. Seurat ovat silti käytettävissä luettelossa.</p>}
      <MapLegend />
    </div>
  );
}
