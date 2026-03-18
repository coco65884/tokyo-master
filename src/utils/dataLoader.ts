import type { FeatureCollection } from 'geojson';
import type { LineIndexEntry, OperatorLineEntry } from '@/types';

const geoCache = new Map<string, FeatureCollection>();
const jsonCache = new Map<string, unknown>();
let lineIndexCache: {
  lines: LineIndexEntry[];
  byOperator: Record<string, OperatorLineEntry[]>;
} | null = null;

async function loadJSON<T>(filename: string): Promise<T> {
  if (jsonCache.has(filename)) return jsonCache.get(filename) as T;
  const resp = await fetch(`${import.meta.env.BASE_URL}data/${filename}`);
  const data = await resp.json();
  jsonCache.set(filename, data);
  return data as T;
}

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

export interface WardCenter {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface WardObjects {
  lineKeys: string[];
  riverNames: string[];
  roadNames: string[];
}

export const loadWardCenters = () => loadJSON<WardCenter[]>('ward_centers.json');
export const loadWardObjects = () => loadJSON<Record<string, WardObjects>>('ward_objects.json');
