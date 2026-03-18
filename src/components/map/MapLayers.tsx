import { useEffect, useState, useMemo } from 'react';
import { GeoJSON, CircleMarker, Polyline, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { FeatureCollection, Feature } from 'geojson';
import { useMapStore } from '@/stores/mapStore';
import type { LineIndexEntry } from '@/types';
import {
  loadWards,
  loadPrefBorders,
  loadRailLines,
  loadRivers,
  loadRoads,
  loadLandmarks,
  loadLineIndex,
  loadWardCenters,
  loadWardObjects,
} from '@/utils/dataLoader';
import type { WardCenter, WardObjects } from '@/utils/dataLoader';

interface GeoData {
  wards: FeatureCollection | null;
  prefBorders: FeatureCollection | null;
  railLines: FeatureCollection | null;
  rivers: FeatureCollection | null;
  roads: FeatureCollection | null;
  landmarks: FeatureCollection | null;
}

interface LayerFlags {
  wards: boolean;
  prefBorders: boolean;
  railLines: Record<string, boolean>;
  rivers: boolean;
  roads: boolean;
  landmarks: boolean;
}

function useGeoData(layers: LayerFlags, wardFocusActive: boolean): GeoData {
  const [data, setData] = useState<GeoData>({
    wards: null,
    prefBorders: null,
    railLines: null,
    rivers: null,
    roads: null,
    landmarks: null,
  });

  useEffect(() => {
    if (!data.wards) loadWards().then((d) => setData((p) => ({ ...p, wards: d })));
  }, [data.wards]);

  useEffect(() => {
    if (layers.prefBorders && !data.prefBorders)
      loadPrefBorders().then((d) => setData((p) => ({ ...p, prefBorders: d })));
  }, [layers.prefBorders, data.prefBorders]);

  // 路線: 手動選択 or フォーカスモードで必要
  useEffect(() => {
    const needRail = Object.values(layers.railLines).some(Boolean) || wardFocusActive;
    if (needRail && !data.railLines)
      loadRailLines().then((d) => setData((p) => ({ ...p, railLines: d })));
  }, [layers.railLines, wardFocusActive, data.railLines]);

  // 川: 手動 or フォーカス
  useEffect(() => {
    if ((layers.rivers || wardFocusActive) && !data.rivers)
      loadRivers().then((d) => setData((p) => ({ ...p, rivers: d })));
  }, [layers.rivers, wardFocusActive, data.rivers]);

  // 道路: 手動 or フォーカス
  useEffect(() => {
    if ((layers.roads || wardFocusActive) && !data.roads)
      loadRoads().then((d) => setData((p) => ({ ...p, roads: d })));
  }, [layers.roads, wardFocusActive, data.roads]);

  useEffect(() => {
    if (layers.landmarks && !data.landmarks)
      loadLandmarks().then((d) => setData((p) => ({ ...p, landmarks: d })));
  }, [layers.landmarks, data.landmarks]);

  return data;
}

function useLineIndex(): LineIndexEntry[] {
  const [lines, setLines] = useState<LineIndexEntry[]>([]);
  useEffect(() => {
    loadLineIndex().then((d) => setLines(d.lines));
  }, []);
  return lines;
}

function useWardMeta(): {
  centers: WardCenter[];
  objects: Record<string, WardObjects>;
} {
  const [centers, setCenters] = useState<WardCenter[]>([]);
  const [objects, setObjects] = useState<Record<string, WardObjects>>({});
  useEffect(() => {
    loadWardCenters().then(setCenters);
    loadWardObjects().then(setObjects);
  }, []);
  return { centers, objects };
}

// ======= Tokyo highlight =======
function TokyoHighlight({ data }: { data: FeatureCollection }) {
  return (
    <GeoJSON
      key="tokyo-bg"
      data={data}
      style={{ color: 'transparent', weight: 0, fillColor: '#e0f2fe', fillOpacity: 0.25 }}
    />
  );
}

// ======= Ward boundaries =======
function WardLayer({
  data,
  focusedWardId,
}: {
  data: FeatureCollection;
  focusedWardId: string | null;
}) {
  const setSelectedWard = useMapStore((s) => s.setSelectedWard);
  const map = useMap();

  const defaultStyle = (feature?: Feature): L.PathOptions => {
    const isFocused = focusedWardId && feature?.properties?.id === focusedWardId;
    return {
      color: isFocused ? '#4a90d9' : '#94a3b8',
      weight: isFocused ? 2.5 : 1.2,
      fillColor: isFocused ? '#a8d8ea' : 'transparent',
      fillOpacity: isFocused ? 0.35 : 0,
    };
  };

  const onEachFeature = (feature: Feature, layer: L.Layer) => {
    const path = layer as L.Path;
    const isFocused = focusedWardId && feature.properties?.id === focusedWardId;

    if (!isFocused) {
      path.on('mouseover', () => {
        path.setStyle({ fillColor: '#a8d8ea', fillOpacity: 0.2, weight: 2, color: '#4a90d9' });
      });
      path.on('mouseout', () => {
        path.setStyle(defaultStyle(feature));
      });
    }

    path.on('dblclick', (e) => {
      L.DomEvent.stopPropagation(e as L.LeafletEvent);
      setSelectedWard(feature.properties?.id);
      map.fitBounds((layer as L.Polygon).getBounds(), { padding: [50, 50] });
    });
  };

  return (
    <GeoJSON
      key={`wards-${focusedWardId || 'none'}`}
      data={data}
      style={defaultStyle}
      onEachFeature={onEachFeature}
    />
  );
}

// ======= Ward name labels (center of each ward) =======
function WardNameLabels({ centers }: { centers: WardCenter[] }) {
  return (
    <>
      {centers.map((c) => (
        <Marker
          key={`wlabel-${c.id}`}
          position={[c.lat, c.lng]}
          icon={L.divIcon({
            className: 'ward-name-label',
            html: `<span>${c.name}</span>`,
            iconSize: [0, 0],
          })}
          interactive={false}
        />
      ))}
    </>
  );
}

// ======= Prefecture borders =======
function PrefBorderLayer({ data }: { data: FeatureCollection }) {
  return (
    <GeoJSON
      key="pref-borders"
      data={data}
      style={{ color: '#64748b', weight: 2.5, opacity: 0.6, dashArray: '10, 6' }}
    />
  );
}

// ======= Rail lines + stations =======
interface WardBBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

function RailLineWithStations({
  railGeoData,
  lineIndex,
  visibleLines,
  focusBBox,
}: {
  railGeoData: FeatureCollection;
  lineIndex: LineIndexEntry[];
  visibleLines: Record<string, boolean>;
  focusBBox: WardBBox | null;
}) {
  const activeKeys = useMemo(
    () =>
      new Set(
        Object.entries(visibleLines)
          .filter(([, v]) => v)
          .map(([k]) => k),
      ),
    [visibleLines],
  );

  const activeLineIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of lineIndex) {
      if (activeKeys.has(entry.key)) {
        for (const lid of entry.lineIds) ids.add(lid);
      }
    }
    return ids;
  }, [lineIndex, activeKeys]);

  const filteredGeo = useMemo(() => {
    if (activeLineIds.size === 0) return null;
    return {
      ...railGeoData,
      features: railGeoData.features.filter((f) => activeLineIds.has(f.properties?.id)),
    } as FeatureCollection;
  }, [railGeoData, activeLineIds]);

  // 駅を名前+近傍で重複排除、所属路線を集約
  const activeStations = useMemo(() => {
    const byNameGrid = new Map<
      string,
      {
        id: string;
        name: string;
        lat: number;
        lng: number;
        color: string;
        inFocus: boolean;
        lineNames: string[];
      }
    >();

    for (const entry of lineIndex) {
      if (!activeKeys.has(entry.key)) continue;
      for (const s of entry.stations) {
        if (s.name.startsWith('駅-')) continue;
        // 名前+グリッド(~100m)で重複判定
        const gridKey = `${s.name}_${Math.round(s.lat * 100)}_${Math.round(s.lng * 100)}`;
        const existing = byNameGrid.get(gridKey);
        if (existing) {
          if (!existing.lineNames.includes(entry.name)) {
            existing.lineNames.push(entry.name);
          }
        } else {
          const inFocus =
            !focusBBox ||
            (s.lat >= focusBBox.minLat &&
              s.lat <= focusBBox.maxLat &&
              s.lng >= focusBBox.minLng &&
              s.lng <= focusBBox.maxLng);
          byNameGrid.set(gridKey, {
            ...s,
            color: entry.color,
            inFocus,
            lineNames: [entry.name],
          });
        }
      }
    }
    return [...byNameGrid.values()];
  }, [lineIndex, activeKeys, focusBBox]);

  if (activeKeys.size === 0) return null;

  return (
    <>
      {filteredGeo && (
        <GeoJSON
          key={`rail-${[...activeKeys].sort().join(',')}`}
          data={filteredGeo}
          style={(feature) => ({
            color: feature?.properties?.color || '#888',
            weight: 3.5,
            opacity: focusBBox ? 0.35 : 0.9,
            lineCap: 'round',
            lineJoin: 'round',
          })}
          onEachFeature={(feature, layer) => {
            (layer as L.Path).bindTooltip(feature.properties?.name || '', {
              sticky: true,
              className: 'rail-tooltip',
            });
          }}
        />
      )}
      {/* フォーカス外の駅（薄い） */}
      {focusBBox &&
        activeStations
          .filter((s) => !s.inFocus)
          .map((s, i) => (
            <CircleMarker
              key={`dim-${i}-${s.name}`}
              center={[s.lat, s.lng]}
              radius={3}
              pathOptions={{ color: '#ccc', fillColor: '#f0f0f0', fillOpacity: 0.6, weight: 1 }}
            >
              <Tooltip permanent direction="top" offset={[0, -4]} className="station-label-dim">
                {s.name}
              </Tooltip>
            </CircleMarker>
          ))}
      {/* フォーカス内 or 非フォーカス時の駅 */}
      {activeStations
        .filter((s) => s.inFocus)
        .map((s, i) => (
          <CircleMarker
            key={`st-${i}-${s.name}`}
            center={[s.lat, s.lng]}
            radius={5}
            pathOptions={{ color: s.color, fillColor: '#fff', fillOpacity: 1, weight: 2 }}
          >
            <Tooltip permanent direction="top" offset={[0, -6]} className="station-label">
              {s.name}
            </Tooltip>
            <Popup>
              <div style={{ fontSize: '0.85rem' }}>
                <strong>{s.name}</strong>
                <div style={{ marginTop: 4, color: '#64748b', fontSize: '0.78rem' }}>
                  {s.lineNames.join(' / ')}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
    </>
  );
}

// ======= Rivers =======
function RiverLayer({ data, filterNames }: { data: FeatureCollection; filterNames?: Set<string> }) {
  const filtered = useMemo(() => {
    if (!filterNames) return data;
    return {
      ...data,
      features: data.features.filter((f) => filterNames.has(f.properties?.name || '')),
    } as FeatureCollection;
  }, [data, filterNames]);

  return (
    <GeoJSON
      key={`rivers-${filterNames ? [...filterNames].join(',') : 'all'}`}
      data={filtered}
      style={{ color: '#38bdf8', weight: 3, opacity: 0.8, lineCap: 'round' }}
      onEachFeature={(feature, layer) => {
        const name = feature.properties?.name || '';
        if (!name) return;
        const path = layer as L.Path;
        path.bindTooltip(name, { sticky: true, className: 'river-tooltip' });
        path.bindPopup(`<strong style="color:#0ea5e9">${name}</strong>`, {
          closeButton: false,
          className: 'river-popup',
        });
        path.on('mouseover', () => {
          path.setStyle({ weight: 5, opacity: 1 });
          path.bringToFront();
        });
        path.on('mouseout', () => {
          path.setStyle({ weight: 3, opacity: 0.8 });
        });
      }}
    />
  );
}

// ======= Roads =======
function RoadLayer({ data, filterNames }: { data: FeatureCollection; filterNames?: Set<string> }) {
  const filtered = useMemo(() => {
    if (!filterNames) return data;
    return {
      ...data,
      features: data.features.filter((f) => filterNames.has(f.properties?.name || '')),
    } as FeatureCollection;
  }, [data, filterNames]);

  return (
    <GeoJSON
      key={`roads-${filterNames ? [...filterNames].join(',') : 'all'}`}
      data={filtered}
      style={{ color: '#fb923c', weight: 2.5, opacity: 0.7, lineCap: 'round' }}
      onEachFeature={(feature, layer) => {
        const name = feature.properties?.name || '';
        if (!name) return;
        const path = layer as L.Path;
        path.bindTooltip(name, { sticky: true, className: 'road-tooltip' });
        path.bindPopup(`<strong style="color:#ea580c">${name}</strong>`, {
          closeButton: false,
          className: 'road-popup',
        });
        path.on('mouseover', () => {
          path.setStyle({ weight: 4, opacity: 1 });
          path.bringToFront();
        });
        path.on('mouseout', () => {
          path.setStyle({ weight: 2.5, opacity: 0.7 });
        });
      }}
    />
  );
}

// ======= Landmarks =======
const landmarkIcon = L.divIcon({
  className: 'landmark-icon',
  html: '<span style="font-size:16px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3))">📍</span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function LandmarkLayer({ data }: { data: FeatureCollection }) {
  return (
    <>
      {data.features.map((feature) => {
        const coords = (feature.geometry as GeoJSON.Point).coordinates;
        return (
          <Marker
            key={feature.properties?.id}
            position={[coords[1], coords[0]]}
            icon={landmarkIcon}
          >
            <Popup>
              <strong>{feature.properties?.name}</strong>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

// ======= Distance dots + line =======
function DistanceOverlay() {
  const points = useMapStore((s) => s.distancePoints);
  return (
    <>
      {points.map((p, i) => (
        <CircleMarker
          key={`dist-pt-${i}`}
          center={p as [number, number]}
          radius={6}
          pathOptions={{ color: '#e91e63', fillColor: '#e91e63', fillOpacity: 1, weight: 2 }}
        />
      ))}
      {points.length === 2 && (
        <Polyline
          positions={points as [number, number][]}
          pathOptions={{ color: '#e91e63', weight: 2.5, dashArray: '8, 6', opacity: 0.9 }}
        />
      )}
    </>
  );
}

// ======= Helpers =======
function computeWardBBox(wardsGeo: FeatureCollection, wardId: string): WardBBox | null {
  const feat = wardsGeo.features.find((f) => f.properties?.id === wardId);
  if (!feat) return null;
  const coords: number[][] = [];
  const flatten = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      coords.push(c as number[]);
    } else if (Array.isArray(c)) {
      for (const sub of c) flatten(sub);
    }
  };
  flatten((feat.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon).coordinates);
  if (coords.length === 0) return null;
  return {
    minLat: Math.min(...coords.map((c) => c[1])),
    maxLat: Math.max(...coords.map((c) => c[1])),
    minLng: Math.min(...coords.map((c) => c[0])),
    maxLng: Math.max(...coords.map((c) => c[0])),
  };
}

// ======= Main =======
export default function MapLayers() {
  const layers = useMapStore((s) => s.layers);
  const selectedWardId = useMapStore((s) => s.selectedWardId);
  const wardFocusMode = useMapStore((s) => s.wardFocusMode);
  const { centers, objects } = useWardMeta();
  const lineIndex = useLineIndex();

  const wardFocusActive = wardFocusMode && !!selectedWardId;
  const geoData = useGeoData(layers, wardFocusActive);

  const focusData = useMemo(() => {
    if (!wardFocusActive || !selectedWardId) return null;
    const wo = objects[selectedWardId];
    if (!wo) return null;
    return {
      lineKeys: new Set(wo.lineKeys),
      riverNames: new Set(wo.riverNames),
      roadNames: new Set(wo.roadNames),
    };
  }, [wardFocusActive, selectedWardId, objects]);

  const focusBBox = useMemo(() => {
    if (!wardFocusActive || !selectedWardId || !geoData.wards) return null;
    return computeWardBBox(geoData.wards, selectedWardId);
  }, [wardFocusActive, selectedWardId, geoData.wards]);

  const effectiveRailLines = useMemo(() => {
    if (focusData) {
      const merged: Record<string, boolean> = {};
      for (const k of focusData.lineKeys) merged[k] = true;
      return merged;
    }
    return layers.railLines;
  }, [focusData, layers.railLines]);

  const showRivers = focusData ? true : layers.rivers;
  const showRoads = focusData ? true : layers.roads;
  const focusedWardId = wardFocusActive ? selectedWardId : null;

  return (
    <>
      {geoData.wards && <TokyoHighlight data={geoData.wards} />}
      {layers.prefBorders && geoData.prefBorders && <PrefBorderLayer data={geoData.prefBorders} />}
      {layers.wards && geoData.wards && (
        <WardLayer data={geoData.wards} focusedWardId={focusedWardId} />
      )}
      {layers.wards && centers.length > 0 && <WardNameLabels centers={centers} />}

      {geoData.railLines && lineIndex.length > 0 && (
        <RailLineWithStations
          railGeoData={geoData.railLines}
          lineIndex={lineIndex}
          visibleLines={effectiveRailLines}
          focusBBox={focusBBox}
        />
      )}

      {showRivers && geoData.rivers && (
        <RiverLayer data={geoData.rivers} filterNames={focusData?.riverNames} />
      )}
      {showRoads && geoData.roads && (
        <RoadLayer data={geoData.roads} filterNames={focusData?.roadNames} />
      )}

      {layers.landmarks && geoData.landmarks && <LandmarkLayer data={geoData.landmarks} />}
      <DistanceOverlay />
    </>
  );
}
