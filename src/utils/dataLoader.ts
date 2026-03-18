import type { FeatureCollection } from 'geojson';

const cache = new Map<string, FeatureCollection>();

async function loadGeoJSON(filename: string): Promise<FeatureCollection> {
  if (cache.has(filename)) return cache.get(filename)!;
  const resp = await fetch(`${import.meta.env.BASE_URL}data/geojson/${filename}`);
  const data: FeatureCollection = await resp.json();
  cache.set(filename, data);
  return data;
}

export const loadWards = () => loadGeoJSON('wards.geojson');
export const loadPrefBorders = () => loadGeoJSON('pref_borders.geojson');
export const loadRailLines = () => loadGeoJSON('rail_lines.geojson');
export const loadStations = () => loadGeoJSON('stations.geojson');
export const loadRivers = () => loadGeoJSON('rivers.geojson');
export const loadRoads = () => loadGeoJSON('roads.geojson');
export const loadLandmarks = () => loadGeoJSON('landmarks.geojson');
