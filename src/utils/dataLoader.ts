import type { FeatureCollection } from 'geojson';
import type { LineIndexEntry, OperatorLineEntry } from '@/types';

const geoCache = new Map<string, FeatureCollection>();
let lineIndexCache: {
  lines: LineIndexEntry[];
  byOperator: Record<string, OperatorLineEntry[]>;
} | null = null;

async function loadGeoJSON(filename: string): Promise<FeatureCollection> {
  if (geoCache.has(filename)) return geoCache.get(filename)!;
  const resp = await fetch(`${import.meta.env.BASE_URL}data/geojson/${filename}`);
  const data: FeatureCollection = await resp.json();
  geoCache.set(filename, data);
  return data;
}

export const loadWards = () => loadGeoJSON('wards.geojson');
export const loadPrefBorders = () => loadGeoJSON('pref_borders.geojson');
export const loadRailLines = () => loadGeoJSON('rail_lines.geojson');
export const loadStations = () => loadGeoJSON('stations.geojson');
export const loadRivers = () => loadGeoJSON('rivers.geojson');
export const loadRoads = () => loadGeoJSON('roads.geojson');
export const loadLandmarks = () => loadGeoJSON('landmarks.geojson');

export async function loadLineIndex(): Promise<{
  lines: LineIndexEntry[];
  byOperator: Record<string, OperatorLineEntry[]>;
}> {
  if (lineIndexCache) return lineIndexCache;
  const resp = await fetch(`${import.meta.env.BASE_URL}data/line_index.json`);
  lineIndexCache = await resp.json();
  return lineIndexCache!;
}
