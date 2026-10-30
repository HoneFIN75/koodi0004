import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import type { Club } from '../models/club';
import { makePopup, markerColor, markerRadius } from '../services/mapService';

interface MapViewProps {
  clubs: Club[];
  selectedClub: Club | null;
}

export function MapView({ clubs, selectedClub }: MapViewProps) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const cluster = useRef<L.MarkerClusterGroup | null>(null);
  const markers = useRef(new Map<Club, L.CircleMarker>());

  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current, { zoomControl: false }).setView([64.5, 26], 5);
    L.control.zoom({ position: 'bottomright' }).addTo(instance);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(instance);
    const markerGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 42,
    });
    markerGroup.addTo(instance);
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
    const group = cluster.current;
    if (!group) return;
    group.clearLayers();
    markers.current.clear();
    for (const club of clubs) {
      const marker = L.circleMarker([club.latitude, club.longitude], {
        radius: markerRadius(club.jasenmaara),
        color: markerColor(club.aanimaara),
        fillColor: markerColor(club.aanimaara),
        fillOpacity: 0.84,
        weight: 1.5,
      }).bindPopup(makePopup(club));
      markers.current.set(club, marker);
      group.addLayer(marker);
    }
  }, [clubs]);

  useEffect(() => {
    if (!selectedClub || !map.current) return;
    map.current.flyTo([selectedClub.latitude, selectedClub.longitude], Math.max(map.current.getZoom(), 10), { duration: 0.7 });
    markers.current.get(selectedClub)?.openPopup();
  }, [selectedClub]);

  return <div className="map-canvas" ref={element} aria-label="Suomen frisbeegolfseurojen kartta" />;
}
