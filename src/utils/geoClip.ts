import type { FeatureCollection, Feature } from 'geojson';

export interface FocusArea {
  /** 粗フィルタ用のbbox */
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  /** ポリゴンリング（外周+穴）の座標列 [lng, lat][] */
  rings: number[][][];
}

/** Ray Casting: 点 [lng, lat] がポリゴンリング内にあるか判定 */
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1];
    const xj = ring[j][0],
      yj = ring[j][1];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** 座標 [lng, lat] がFocusArea（区ポリゴン）内にあるか判定 */
export function pointInFocusArea(c: number[], area: FocusArea): boolean {
  const lng = c[0],
    lat = c[1];
  if (lat < area.minLat || lat > area.maxLat || lng < area.minLng || lng > area.maxLng) {
    return false;
  }
  if (!pointInRing(lng, lat, area.rings[0])) return false;
  for (let i = 1; i < area.rings.length; i++) {
    if (pointInRing(lng, lat, area.rings[i])) return false;
  }
  return true;
}

/** LineString座標列をポリゴン内の連続セグメントに分割 */
function clipLineToFocusArea(coords: number[][], area: FocusArea): number[][][] {
  const segments: number[][][] = [];
  let current: number[][] = [];
  for (const c of coords) {
    if (pointInFocusArea(c, area)) {
      current.push(c);
    } else {
      if (current.length >= 2) segments.push(current);
      current = [];
    }
  }
  if (current.length >= 2) segments.push(current);
  return segments;
}

/** FeatureCollectionをポリゴンでクリッピング */
export function clipGeoJSONToFocusArea(
  data: FeatureCollection,
  area: FocusArea,
): FeatureCollection {
  const clippedFeatures: Feature[] = [];
  for (const feat of data.features) {
    const geom = feat.geometry;
    let allCoords: number[][][] = [];
    if (geom.type === 'LineString') {
      allCoords = [(geom as GeoJSON.LineString).coordinates as number[][]];
    } else if (geom.type === 'MultiLineString') {
      allCoords = (geom as GeoJSON.MultiLineString).coordinates as number[][][];
    } else {
      continue;
    }

    const clippedSegments: number[][][] = [];
    for (const line of allCoords) {
      clippedSegments.push(...clipLineToFocusArea(line, area));
    }

    if (clippedSegments.length === 0) continue;

    clippedFeatures.push({
      ...feat,
      geometry:
        clippedSegments.length === 1
          ? { type: 'LineString', coordinates: clippedSegments[0] }
          : { type: 'MultiLineString', coordinates: clippedSegments },
    });
  }
  return { type: 'FeatureCollection', features: clippedFeatures };
}

/** wards GeoJSON から区のFocusAreaを抽出 */
export function extractFocusArea(wardsGeo: FeatureCollection, wardId: string): FocusArea | null {
  const feat = wardsGeo.features.find((f) => f.properties?.id === wardId);
  if (!feat) return null;

  const geom = feat.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
  let rings: number[][][];
  if (geom.type === 'Polygon') {
    rings = geom.coordinates as number[][][];
  } else {
    rings = (geom.coordinates as number[][][][]).map((poly) => poly[0]);
  }

  if (rings.length === 0 || rings[0].length === 0) return null;

  const allCoords = rings.flat();
  return {
    minLat: Math.min(...allCoords.map((c) => c[1])),
    maxLat: Math.max(...allCoords.map((c) => c[1])),
    minLng: Math.min(...allCoords.map((c) => c[0])),
    maxLng: Math.max(...allCoords.map((c) => c[0])),
    rings,
  };
}
