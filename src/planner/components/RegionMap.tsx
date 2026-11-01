import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import type { MunicipalityDataset, Position, Region } from '../../models/region';
import type { ProvinceDataset, ProvinceOverlaySettings } from '../../models/province.ts';
import { outlineSegments } from '../../services/geoService';
import { createProvinceOverlay } from '../../services/provinceOverlay.ts';
import { formatCount, markerColor, markerRadius } from '../../services/mapService';
import { getMunicipalityRank, getPopulationCategory, populationCategories, summarizePopulation } from '../../services/populationService';
import type { ClubPlacement, MunicipalityAggregate } from '../../services/regionAnalytics';
import { readableTextColor } from '../../services/regionColors';

export const FINLAND_BOUNDS: L.LatLngBoundsExpression = [[59.45, 19.1], [70.15, 31.6]];
const UNASSIGNED_COLOR = '#E11D48';

interface RegionMapProps {
  dataset: MunicipalityDataset;
  regions: Region[];
  membership: Map<string, Region[]>;
  editingRegion: Region | null;
  selectedRegionId: string | null;
  selectedMunicipalityCode: string | null;
  highlightCodes: Set<string> | null;
  matchCodes: Set<string> | null;
  aggregates: Map<string, MunicipalityAggregate>;
  placements: ClubPlacement[];
  showClubs: boolean;
  showBaseMap: boolean;
  populationLayer: boolean;
  dark: boolean;
  provinces: ProvinceDataset | null;
  provinceSettings: ProvinceOverlaySettings;
  onMunicipalityClick: (code: string) => void;
  onRegionSelect: (id: string) => void;
}

// Leaflet forwards GeoJSON options (including the canvas renderer) to the polygons it creates.
type VectorGeoJSONOptions = L.GeoJSONOptions & L.PathOptions;

const outlineCache = new Map<string, Position[][]>();
function cachedOutline(region: Region, dataset: MunicipalityDataset): Position[][] {
  const codes = [...new Set(region.municipalityCodes)].filter((code) => dataset.byCode.has(code)).sort();
  const key = codes.join(',');
  let segments = outlineCache.get(key);
  if (!segments) {
    segments = outlineSegments(codes.map((code) => dataset.byCode.get(code)!.geometry));
    if (outlineCache.size > 400) outlineCache.clear();
    outlineCache.set(key, segments);
  }
  return segments;
}

function regionLabelPoint(region: Region, dataset: MunicipalityDataset): Position | null {
  const members = region.municipalityCodes.map((code) => dataset.byCode.get(code)).filter((item) => item !== undefined);
  if (members.length === 0) return null;
  const total = members.reduce((sum, item) => sum + item.areaKm2, 0) || 1;
  const centre: Position = [
    members.reduce((sum, item) => sum + item.labelPoint[0] * item.areaKm2, 0) / total,
    members.reduce((sum, item) => sum + item.labelPoint[1] * item.areaKm2, 0) / total,
  ];
  const nearest = members.reduce((best, item) => {
    const distance = (item.labelPoint[0] - centre[0]) ** 2 * 0.25 + (item.labelPoint[1] - centre[1]) ** 2;
    return distance < best.distance ? { item, distance } : best;
  }, { item: members[0], distance: Infinity });
  return nearest.item.labelPoint;
}

const toLatLngs = (line: Position[]) => line.map(([lng, lat]) => L.latLng(lat, lng));
const multiPolygon = (dataset: MunicipalityDataset, codes: string[]): GeoJSON.Feature[] => codes.flatMap((code) => {
  const municipality = dataset.byCode.get(code);
  return municipality ? [{ type: 'Feature', properties: { code }, geometry: { type: 'MultiPolygon', coordinates: municipality.geometry.polygons } }] : [];
});

function tooltipElement(title: string, lines: string[]): HTMLElement {
  const root = document.createElement('div');
  root.className = 'planner-tooltip';
  const heading = document.createElement('strong');
  heading.textContent = title;
  root.append(heading, ...lines.map((line) => { const span = document.createElement('span'); span.textContent = line; return span; }));
  return root;
}

export function RegionMap(props: RegionMapProps) {
  const element = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const layers = useRef<{
    map: L.Map; tiles: L.TileLayer; municipalities: L.GeoJSON; fills: L.LayerGroup; outlines: L.LayerGroup; labels: L.LayerGroup; clubs: L.MarkerClusterGroup; provinceOverlay: ReturnType<typeof createProvinceOverlay> | null;
    renderers: Record<'fill' | 'municipality' | 'outline', L.Canvas>;
  } | null>(null);
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const { dataset } = props;

  useEffect(() => {
    if (!element.current) return undefined;
    const map = L.map(element.current, { zoomSnap: 0.25, minZoom: 4, maxZoom: 18, maxBounds: [[54, 8], [74, 42]], zoomAnimation: !reducedMotion, fadeAnimation: !reducedMotion, attributionControl: true });
    map.fitBounds(FINLAND_BOUNDS);
    const panes = [['provinceOverlay', 405], ['regionFill', 410], ['municipality', 420], ['regionOutline', 430], ['clubs', 440]] as const;
    for (const [name, zIndex] of panes) map.createPane(name).style.zIndex = String(zIndex);
    const renderers = {
      fill: L.canvas({ pane: 'regionFill', padding: 0.4 }),
      municipality: L.canvas({ pane: 'municipality', padding: 0.4, tolerance: 2 }),
      outline: L.canvas({ pane: 'regionOutline', padding: 0.4 }),
    };
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Kuntarajat &copy; Tilastokeskus (CC BY 4.0)',
    });
    const municipalities = L.geoJSON({ type: 'FeatureCollection', features: multiPolygon(dataset, dataset.municipalities.map((item) => item.code)) } as GeoJSON.FeatureCollection, {
      pane: 'municipality',
      renderer: renderers.municipality,
      onEachFeature: (feature, layer) => {
        const code = String(feature.properties?.code);
        layer.on('click', () => latest.current.onMunicipalityClick(code));
        layer.bindTooltip(() => {
          const current = latest.current;
          const municipality = current.dataset.byCode.get(code);
          const aggregate = current.aggregates.get(code);
          const regions = current.membership.get(code) ?? [];
          return tooltipElement(municipality?.name ?? code, [
            municipality?.province ?? '',
            `Väestö 2025: ${formatCount(municipality?.population ?? null)} · sijoitus ${municipality ? getMunicipalityRank(municipality.name) ?? 'ei tietoa' : 'ei tietoa'}`,
            getPopulationCategory(municipality?.population ?? null)?.label ?? 'Väestötieto puuttuu',
            `Seuroja ${aggregate?.clubs.length ?? 0} · jäseniä ${aggregate?.members ?? 0} · ääniä ${aggregate?.votes ?? 0}`,
            regions.length ? `Alueet: ${regions.map((region) => `${region.number} ${region.shortName}`).join(', ')}` : 'Ei kuulu alueeseen',
            current.editingRegion ? (current.editingRegion.municipalityCodes.includes(code) ? 'Poista alueesta napsauttamalla' : 'Lisää alueeseen napsauttamalla') : '',
          ].filter(Boolean));
        }, { sticky: true, direction: 'top', opacity: 1 });
      },
    } as VectorGeoJSONOptions).addTo(map);
    const fills = L.layerGroup().addTo(map);
    const outlines = L.layerGroup().addTo(map);
    const labels = L.layerGroup().addTo(map);
    const clubs = L.markerClusterGroup({
      animate: !reducedMotion,
      clusterPane: 'clubs',
      maxClusterRadius: 40,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: true,
      iconCreateFunction: (group) => {
        const count = group.getChildCount();
        return L.divIcon({
          html: `<span>${count}<small class="sr-only"> seuraa. Lähennä karttaa tai avaa ryhmä.</small></span>`,
          className: 'club-cluster',
          iconSize: [44, 44],
        });
      },
    }).addTo(map);
    const provinceOverlay = props.provinces
      ? createProvinceOverlay(dataset, props.provinces, props.provinceSettings, 'provinceOverlay')
      : null;
    if (provinceOverlay && props.provinceSettings.showRegions) provinceOverlay.addTo(map);
    layers.current = { map, tiles, municipalities, fills, outlines, labels, clubs, provinceOverlay, renderers };
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(element.current);
    return () => { observer.disconnect(); map.remove(); layers.current = null; };
  }, [dataset, props.provinces, reducedMotion]);

  useEffect(() => {
    const current = layers.current;
    if (!current?.provinceOverlay) return;
    current.provinceOverlay.updateSettings(props.provinceSettings);
    if (props.provinceSettings.showRegions) current.provinceOverlay.addTo(current.map);
    else current.provinceOverlay.remove();
  }, [props.provinceSettings, props.provinces]);

  useEffect(() => {
    const current = layers.current;
    if (!current) return;
    if (props.showBaseMap) current.tiles.addTo(current.map); else current.tiles.remove();
  }, [props.showBaseMap]);

  const { regions, selectedRegionId, onRegionSelect } = props;
  useEffect(() => {
    const current = layers.current;
    if (!current) return;
    current.fills.clearLayers(); current.outlines.clearLayers(); current.labels.clearLayers();
    const counts = new Map<string, number>();
    for (const region of regions) for (const code of new Set(region.municipalityCodes)) counts.set(code, (counts.get(code) ?? 0) + 1);
    const areaOf = (region: Region) => region.municipalityCodes.reduce((sum, code) => sum + (dataset.byCode.get(code)?.areaKm2 ?? 0), 0);
    const ordered = [...regions].sort((a, b) => areaOf(b) - areaOf(a));
    const placedLabels: L.Point[] = [];
    for (const region of ordered) {
      if (region.municipalityCodes.length === 0) continue;
      const selected = region.id === selectedRegionId;
      if (!props.populationLayer) L.geoJSON({ type: 'FeatureCollection', features: multiPolygon(dataset, region.municipalityCodes) } as GeoJSON.FeatureCollection, {
        pane: 'regionFill', renderer: current.renderers.fill, interactive: false,
        style: { stroke: false, fillColor: region.color, fillOpacity: Math.min(1, region.opacity + (selected ? 0.12 : 0)) },
      } as VectorGeoJSONOptions).addTo(current.fills);
      const overlapping = region.municipalityCodes.some((code) => (counts.get(code) ?? 0) > 1);
      L.polyline(cachedOutline(region, dataset).map(toLatLngs), {
        pane: 'regionOutline', renderer: current.renderers.outline, interactive: false,
        color: region.color, weight: selected ? 4.5 : 2.5, opacity: 0.95, dashArray: overlapping && !selected ? '7 5' : undefined, lineJoin: 'round',
      }).addTo(current.outlines);
      const point = regionLabelPoint(region, dataset);
      if (!point) continue;
      const pixel = current.map.project([point[1], point[0]], 6);
      const stack = placedLabels.filter((other) => Math.abs(other.x - pixel.x) < 70 && Math.abs(other.y - pixel.y) < 22).length;
      placedLabels.push(L.point(pixel.x, pixel.y + stack * 24));
      const container = document.createElement('span');
      container.className = `region-label${selected ? ' selected' : ''}`;
      container.style.setProperty('--region-color', region.color);
      container.style.setProperty('--region-text', readableTextColor(region.color));
      container.style.setProperty('--stack', String(stack));
      const badge = document.createElement('b'); badge.textContent = String(region.number);
      const name = document.createElement('span'); name.textContent = region.shortName || region.name;
      container.append(badge, name);
      const codes = [...new Set(region.municipalityCodes)];
      const population = codes.some((code) => !dataset.byCode.has(code)) ? null
        : summarizePopulation(codes.map((code) => dataset.byCode.get(code)!)).total;
      L.marker([point[1], point[0]], {
        icon: L.divIcon({ className: 'region-label-icon', html: container, iconSize: [0, 0] }),
        keyboard: true, title: `Alue ${region.number}: ${region.name}`, alt: `Alue ${region.number}: ${region.name}`, riseOnHover: true, zIndexOffset: selected ? 1000 : 0,
      }).bindTooltip(tooltipElement(region.name, [`Väestö 2025: ${formatCount(population)}`]))
        .on('click', () => onRegionSelect(region.id)).addTo(current.labels);
    }
  }, [regions, dataset, selectedRegionId, onRegionSelect, props.populationLayer]);

  const { editingRegion, selectedMunicipalityCode, highlightCodes, matchCodes, dark } = props;
  useEffect(() => {
    const current = layers.current;
    if (!current) return;
    const editingCodes = editingRegion ? new Set(editingRegion.municipalityCodes) : null;
    current.municipalities.eachLayer((layer) => {
      const code = String((layer as L.GeoJSON & { feature?: GeoJSON.Feature }).feature?.properties?.code);
      const style: L.PathOptions = { color: dark ? '#CBD5E1' : '#475569', weight: 0.6, opacity: 0.55, fill: true, fillColor: '#000000', fillOpacity: 0 };
      if (props.populationLayer) Object.assign(style, { fillColor: getPopulationCategory(dataset.byCode.get(code)?.population ?? null)?.color ?? '#64748b', fillOpacity: 0.65 });
      if (highlightCodes?.has(code)) Object.assign(style, { fillColor: UNASSIGNED_COLOR, fillOpacity: 0.28, color: UNASSIGNED_COLOR, weight: 1.2, opacity: 0.9 });
      if (matchCodes?.has(code)) Object.assign(style, { color: '#0284C7', weight: 2.2, opacity: 1 });
      if (editingRegion && editingCodes?.has(code)) Object.assign(style, { color: editingRegion.color, weight: 2.4, opacity: 1, fillColor: editingRegion.color, fillOpacity: 0.22 });
      if (code === selectedMunicipalityCode) Object.assign(style, { color: dark ? '#F8FAFC' : '#0F172A', weight: 3.2, opacity: 1 });
      (layer as L.Path).setStyle(style);
      if (layer.isTooltipOpen()) layer.getTooltip()?.update();
    });
  }, [editingRegion, selectedMunicipalityCode, highlightCodes, matchCodes, dark, dataset, props.membership, props.populationLayer]);

  const { placements, showClubs } = props;
  useEffect(() => {
    const current = layers.current;
    if (!current) return;
    current.clubs.clearLayers();
    if (!showClubs) return;
    const markers: L.Marker[] = [];
    for (const { club, municipalityCode } of placements) {
      if (club.latitude === null || club.longitude === null) continue;
      const diameter = Math.max(8, markerRadius(club.jasenmaara) * 1.1);
      const iconSize = Math.max(44, diameter);
      const marker = L.marker([club.latitude, club.longitude], {
        pane: 'clubs',
        icon: L.divIcon({
          className: 'club-marker',
          html: `<span style="width:${diameter}px;height:${diameter}px;background:${markerColor(club.aanimaara)}"></span>`,
          iconSize: [iconSize, iconSize],
          iconAnchor: [iconSize / 2, iconSize / 2],
        }),
        keyboard: true,
        title: `${club.seura}, ${club.paikkakunta}. Avaa seuran tiedot.`,
        alt: club.seura,
      }).bindTooltip(tooltipElement(club.seura, [club.paikkakunta, `Jäseniä ${club.jasenmaara ?? 'ei tietoa'} · ääniä ${club.aanimaara ?? 'ei tietoa'}`, `Kunnan väestö 2025: ${formatCount(municipalityCode ? dataset.byCode.get(municipalityCode)?.population ?? null : null)}`]), { direction: 'top' });
      marker.on('add', () => {
        const node = marker.getElement();
        node?.setAttribute('aria-label', marker.options.title ?? club.seura);
        if (node) {
          node.onkeydown = (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              marker.openTooltip();
            }
          };
        }
      });
      markers.push(marker);
    }
    current.clubs.addLayers(markers);
  }, [placements, showClubs, dataset]);

  useEffect(() => {
    const current = layers.current;
    const region = regions.find((item) => item.id === selectedRegionId);
    if (!current || !region) return;
    const members = region.municipalityCodes.map((code) => dataset.byCode.get(code)).filter((item) => item !== undefined);
    if (members.length === 0) return;
    const bounds = L.latLngBounds(members.flatMap((item) => [L.latLng(item.bounds[0][1], item.bounds[0][0]), L.latLng(item.bounds[1][1], item.bounds[1][0])]));
    current.map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 8, animate: !reducedMotion, duration: 0.6 });
    // Only refocus when the selection changes, not on every edit of the selected region.
  }, [selectedRegionId]);

  return (
    <div className={`planner-map-frame${dark ? ' dark' : ''}`}>
      <div ref={element} className="planner-map" role="region" aria-label="Aluekartta. Kuntia voi valita myös kuntaluettelosta." />
      <button type="button" className="map-reset" onClick={() => layers.current?.map.flyToBounds(FINLAND_BOUNDS, { animate: !reducedMotion })}>Koko Suomi</button>
      {props.populationLayer && <div className="population-map-legend" aria-label="Väestökartan selite"><strong>Kunnan väestö 2025</strong>{populationCategories.map((item) => <span key={item.id}><i style={{ background: item.color }} />{item.label} ≥ {formatCount(item.min)}</span>)}<span><i style={{ background: '#64748b' }} />Ei tietoa</span></div>}
    </div>
  );
}
