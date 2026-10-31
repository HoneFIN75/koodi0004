import type { MunicipalityGeometry, Position } from '../models/region';

const EARTH_RADIUS = 6378137;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Spherical ring area in m² (same approximation as Turf.js). */
export function ringArea(ring: Position[]): number {
  let total = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [lng1, lat1] = ring[index === 0 ? ring.length - 1 : index - 1];
    const [lng2, lat2] = ring[index];
    total += toRadians(lng2 - lng1) * (2 + Math.sin(toRadians(lat1)) + Math.sin(toRadians(lat2)));
  }
  return Math.abs((total * EARTH_RADIUS * EARTH_RADIUS) / 2);
}

export function geometryAreaKm2(geometry: MunicipalityGeometry): number {
  return geometry.polygons.reduce((sum, [outer, ...holes]) => (
    sum + ringArea(outer) - holes.reduce((holeSum, hole) => holeSum + ringArea(hole), 0)
  ), 0) / 1e6;
}

export function geometryBounds(geometry: MunicipalityGeometry): [Position, Position] {
  let minLng = Infinity; let minLat = Infinity; let maxLng = -Infinity; let maxLat = -Infinity;
  for (const polygon of geometry.polygons) {
    for (const [lng, lat] of polygon[0] ?? []) {
      minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    }
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}

function pointInRing([lng, lat]: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInGeometry(point: Position, geometry: MunicipalityGeometry): boolean {
  return geometry.polygons.some(([outer, ...holes]) => outer !== undefined && pointInRing(point, outer) && !holes.some((hole) => pointInRing(point, hole)));
}

function ringCentroid(ring: Position[]): Position | null {
  let twiceArea = 0; let x = 0; let y = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [x1, y1] = ring[index === 0 ? ring.length - 1 : index - 1];
    const [x2, y2] = ring[index];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross; x += (x1 + x2) * cross; y += (y1 + y2) * cross;
  }
  return twiceArea === 0 ? null : [x / (3 * twiceArea), y / (3 * twiceArea)];
}

/** Centroid of the largest polygon, falling back to its bounding-box centre when the centroid lies outside. */
export function geometryLabelPoint(geometry: MunicipalityGeometry): Position {
  const largest = [...geometry.polygons].sort((a, b) => ringArea(b[0] ?? []) - ringArea(a[0] ?? []))[0];
  const outer = largest?.[0] ?? [];
  const centroid = ringCentroid(outer);
  if (centroid && pointInRing(centroid, outer)) return centroid;
  const [[minLng, minLat], [maxLng, maxLat]] = geometryBounds({ type: 'Polygon', polygons: largest ? [largest] : [] });
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
}

/**
 * Outline of a set of municipalities: edges shared by an even number of rings are interior borders and are dropped.
 * Relies on the boundary dataset being topologically consistent (shared borders use identical vertices).
 */
export function outlineSegments(geometries: MunicipalityGeometry[]): Position[][] {
  const edges = new Map<string, { count: number; edge: [Position, Position] }>();
  for (const geometry of geometries) {
    for (const polygon of geometry.polygons) {
      for (const ring of polygon) {
        for (let index = 1; index < ring.length; index += 1) {
          const a = ring[index - 1]; const b = ring[index];
          const keyA = `${a[0]},${a[1]}`; const keyB = `${b[0]},${b[1]}`;
          if (keyA === keyB) continue;
          const key = keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
          const entry = edges.get(key);
          if (entry) entry.count += 1; else edges.set(key, { count: 1, edge: [a, b] });
        }
      }
    }
  }
  const remaining = [...edges.values()].filter((entry) => entry.count % 2 === 1).map((entry) => entry.edge);
  return chainSegments(remaining);
}

function chainSegments(segments: [Position, Position][]): Position[][] {
  const key = (point: Position) => `${point[0]},${point[1]}`;
  const byStart = new Map<string, number[]>();
  segments.forEach(([a, b], index) => {
    for (const point of [a, b]) {
      const list = byStart.get(key(point));
      if (list) list.push(index); else byStart.set(key(point), [index]);
    }
  });
  const used = new Uint8Array(segments.length);
  const lines: Position[][] = [];
  for (let start = 0; start < segments.length; start += 1) {
    if (used[start]) continue;
    used[start] = 1;
    const line: Position[] = [segments[start][0], segments[start][1]];
    let extended = true;
    while (extended) {
      extended = false;
      const tail = line[line.length - 1];
      for (const candidate of byStart.get(key(tail)) ?? []) {
        if (used[candidate]) continue;
        used[candidate] = 1;
        const [a, b] = segments[candidate];
        line.push(key(a) === key(tail) ? b : a);
        extended = true;
        break;
      }
    }
    lines.push(line);
  }
  return lines;
}
