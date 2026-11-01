import L from 'leaflet';
import type * as GeoJson from 'geojson';
import type { MunicipalityDataset } from '../models/region.ts';
import type { ProvinceDataset, ProvinceOverlaySettings } from '../models/province.ts';
import { outlineSegments } from './geoService.ts';

type ProvinceOverlayLayer = L.LayerGroup & {
  updateSettings: (settings: ProvinceOverlaySettings) => void;
};

export function createProvinceOverlay(
  dataset: MunicipalityDataset,
  provinces: ProvinceDataset,
  initialSettings: ProvinceOverlaySettings,
  pane?: string,
): ProvinceOverlayLayer {
  const root = L.layerGroup() as ProvinceOverlayLayer;
  const layers: { fill: L.GeoJSON; border: L.Polyline; color: string }[] = [];
  let settings = initialSettings;
  for (const province of provinces.regions) {
    const municipalities = dataset.municipalities.filter((item) => item.province === province.municipalityProvince);
    if (municipalities.length === 0) continue;
    const features: GeoJson.Feature[] = municipalities.map((municipality) => ({
      type: 'Feature',
      properties: { provinceId: province.id },
      geometry: {
        type: municipality.geometry.type,
        coordinates: municipality.geometry.type === 'Polygon'
          ? municipality.geometry.polygons[0]
          : municipality.geometry.polygons,
      } as GeoJson.Geometry,
    }));
    const fill = L.geoJSON({
      type: 'FeatureCollection',
      features,
    } as GeoJson.FeatureCollection, {
      pane,
      style: { className: 'province-fill', color: province.color, weight: 0, fillColor: province.color, fillOpacity: settings.regionOpacity, stroke: false },
      onEachFeature: (_feature, layer) => {
        if (!(layer instanceof L.Path)) return;
        layer.bindTooltip(province.name, { sticky: true });
        layer.on('mouseover', () => layer.setStyle({ fillOpacity: Math.min(0.65, settings.regionOpacity + 0.2) }));
        layer.on('mouseout', () => layer.setStyle({ fillOpacity: settings.regionOpacity }));
      },
    }).addTo(root);
    const border = L.polyline(
      outlineSegments(municipalities.map((item) => item.geometry)).flatMap((line) => [line.map(([lng, lat]) => L.latLng(lat, lng))]),
      { pane, className: 'province-border', color: province.color, weight: 2, opacity: settings.showRegionBorders ? 0.95 : 0, interactive: false, lineJoin: 'round' },
    ).addTo(root);
    layers.push({ fill, border, color: province.color });
  }
  root.updateSettings = (next) => {
    settings = next;
    for (const { fill, border, color } of layers) {
      fill.setStyle({ className: 'province-fill', color, weight: 0, fillColor: color, fillOpacity: next.showRegions ? next.regionOpacity : 0, stroke: false });
      border.setStyle({ opacity: next.showRegions && next.showRegionBorders ? 0.95 : 0 });
    }
  };
  root.updateSettings(settings);
  return root;
}
