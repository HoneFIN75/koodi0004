import L from 'leaflet';
import type * as GeoJson from 'geojson';
import type { MunicipalityDataset } from '../models/region.ts';
import type { ProvinceDataset, ProvinceOverlaySettings } from '../models/province.ts';
import { outlineSegments } from './geoService.ts';
import { createMunicipalityTooltip } from './mapService.ts';

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
  const layers: { fill: L.GeoJSON; border: L.Polyline; style: (feature?: GeoJson.Feature) => L.PathOptions }[] = [];
  let settings = initialSettings;
  for (const province of provinces.regions) {
    const municipalities = dataset.municipalities.filter((item) => item.province === province.municipalityProvince);
    if (municipalities.length === 0) continue;
    const features: GeoJson.Feature[] = municipalities.map((municipality) => ({
      type: 'Feature',
      properties: { provinceId: province.id, municipalityCode: municipality.code },
      geometry: {
        type: municipality.geometry.type,
        coordinates: municipality.geometry.type === 'Polygon'
          ? municipality.geometry.polygons[0]
          : municipality.geometry.polygons,
      } as GeoJson.Geometry,
    }));
    const provinceStyle = (feature?: GeoJson.Feature) => ({
      className: `province-fill municipality-${String(feature?.properties?.municipalityCode ?? '')}`,
      color: province.color,
      weight: 0,
      fillColor: province.color,
      fillOpacity: settings.showRegions ? settings.regionOpacity : 0,
      stroke: false,
    });
    const fill = L.geoJSON({
      type: 'FeatureCollection',
      features,
    } as GeoJson.FeatureCollection, {
      pane,
      style: provinceStyle,
      onEachFeature: (feature, layer) => {
        if (!(layer instanceof L.Path)) return;
        const code = String(feature.properties?.municipalityCode);
        const municipality = dataset.byCode.get(code);
        layer.bindTooltip(createMunicipalityTooltip(municipality?.name ?? code, province.name), { sticky: true });
        layer.on('mouseover', () => layer.setStyle({ color: '#64748b', fillColor: '#64748b', weight: 1, fillOpacity: 0.45, opacity: 0.9 }));
        layer.on('mouseout', () => layer.setStyle({ color: province.color, fillColor: province.color, weight: 0, fillOpacity: settings.regionOpacity, opacity: 1 }));
      },
    }).addTo(root);
    const border = L.polyline(
      outlineSegments(municipalities.map((item) => item.geometry)).flatMap((line) => [line.map(([lng, lat]) => L.latLng(lat, lng))]),
      { pane, className: 'province-border', color: province.color, weight: 2, opacity: settings.showRegionBorders ? 0.95 : 0, interactive: false, lineJoin: 'round' },
    ).addTo(root);
    layers.push({ fill, border, style: provinceStyle });
  }
  root.updateSettings = (next) => {
    settings = next;
    for (const { fill, border, style } of layers) {
      fill.setStyle(style);
      border.setStyle({ opacity: next.showRegions && next.showRegionBorders ? 0.95 : 0 });
    }
  };
  root.updateSettings(settings);
  return root;
}
