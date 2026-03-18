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
} from '@/utils/dataLoader';

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

function useGeoData(layers: LayerFlags): GeoData {
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

  useEffect(() => {
    if (Object.values(layers.railLines).some(Boolean) && !data.railLines)
      loadRailLines().then((d) => setData((p) => ({ ...p, railLines: d })));
  }, [layers.railLines, data.railLines]);

  useEffect(() => {
    if (layers.rivers && !data.rivers)
      loadRivers().then((d) => setData((p) => ({ ...p, rivers: d })));
  }, [layers.rivers, data.rivers]);

  useEffect(() => {
    if (layers.roads && !data.roads) loadRoads().then((d) => setData((p) => ({ ...p, roads: d })));
  }, [layers.roads, data.roads]);

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

// ======= Tokyo highlight (always on) =======
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
function WardLayer({ data }: { data: FeatureCollection }) {
  const setSelectedWard = useMapStore((s) => s.setSelectedWard);
  const map = useMap();

  const onEachFeature = (feature: Feature, layer: L.Layer) => {
    const name = feature.properties?.name || '';
    const path = layer as L.Path;
    path.bindTooltip(name, { sticky: true, className: 'ward-tooltip', direction: 'center' });
    path.on('mouseover', () => {
      path.setStyle({ fillColor: '#a8d8ea', fillOpacity: 0.4, weight: 2.5, color: '#4a90d9' });
      path.bringToFront();
    });
    path.on('mouseout', () => {
      path.setStyle({ fillColor: 'transparent', fillOpacity: 0, weight: 1.2, color: '#94a3b8' });
    });
    path.on('click', () => {
      setSelectedWard(feature.properties?.id);
      map.fitBounds((layer as L.Polygon).getBounds(), { padding: [50, 50] });
    });
  };

  return (
    <GeoJSON
      key="wards"
      data={data}
      style={{ color: '#94a3b8', weight: 1.2, fillColor: 'transparent', fillOpacity: 0 }}
      onEachFeature={onEachFeature}
    />
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

// ======= Rail lines + stations per line =======
function RailLineWithStations({
  railGeoData,
  lineIndex,
  visibleLines,
}: {
  railGeoData: FeatureCollection;
  lineIndex: LineIndexEntry[];
  visibleLines: Record<string, boolean>;
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

  const activeStations = useMemo(() => {
    const stations: { id: string; name: string; lat: number; lng: number; color: string }[] = [];
    const seen = new Set<string>();
    for (const entry of lineIndex) {
      if (!activeKeys.has(entry.key)) continue;
      for (const s of entry.stations) {
        if (!seen.has(s.id)) {
          seen.add(s.id);
          stations.push({ ...s, color: entry.color });
        }
      }
    }
    return stations;
  }, [lineIndex, activeKeys]);

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
            opacity: 0.9,
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
      {activeStations.map((s) => (
        <CircleMarker
          key={s.id}
          center={[s.lat, s.lng]}
          radius={5}
          pathOptions={{ color: s.color, fillColor: '#fff', fillOpacity: 1, weight: 2 }}
        >
          <Tooltip permanent direction="top" offset={[0, -6]} className="station-label">
            {s.name}
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}

// ======= Rivers with name labels =======
function RiverLayer({ data }: { data: FeatureCollection }) {
  const namePoints = useMemo(() => {
    const byName: Record<string, { lat: number; lng: number }[]> = {};
    for (const f of data.features) {
      const name = f.properties?.name || '';
      if (!name) continue;
      const coords = (f.geometry as GeoJSON.LineString).coordinates;
      if (coords.length > 0) {
        const mid = coords[Math.floor(coords.length / 2)];
        if (!byName[name]) byName[name] = [];
        byName[name].push({ lat: mid[1], lng: mid[0] });
      }
    }
    return Object.entries(byName).map(([name, pts]) => {
      const mid = pts[Math.floor(pts.length / 2)];
      return { name, ...mid };
    });
  }, [data]);

  return (
    <>
      <GeoJSON
        key="rivers"
        data={data}
        style={{ color: '#38bdf8', weight: 2.5, opacity: 0.8, lineCap: 'round' }}
        onEachFeature={(feature, layer) => {
          (layer as L.Path).bindTooltip(feature.properties?.name || '', {
            sticky: true,
            className: 'river-tooltip',
          });
        }}
      />
      {namePoints.map((p) => (
        <Marker
          key={`river-label-${p.name}`}
          position={[p.lat, p.lng]}
          icon={L.divIcon({
            className: 'river-name-label',
            html: `<span>${p.name}</span>`,
            iconSize: [0, 0],
          })}
          interactive={false}
        />
      ))}
    </>
  );
}

// ======= Roads =======
function RoadLayer({ data }: { data: FeatureCollection }) {
  return (
    <GeoJSON
      key="roads"
      data={data}
      style={{ color: '#fb923c', weight: 2, opacity: 0.7, lineCap: 'round' }}
      onEachFeature={(feature, layer) => {
        (layer as L.Path).bindTooltip(feature.properties?.name || '', {
          sticky: true,
          className: 'road-tooltip',
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

// ======= Distance line =======
function DistancePolyline() {
  const points = useMapStore((s) => s.distancePoints);
  if (points.length < 2) return null;
  return (
    <Polyline
      positions={points as [number, number][]}
      pathOptions={{ color: '#e91e63', weight: 2.5, dashArray: '8, 6', opacity: 0.9 }}
    />
  );
}

// ======= Main =======
export default function MapLayers() {
  const layers = useMapStore((s) => s.layers);
  const geoData = useGeoData(layers);
  const lineIndex = useLineIndex();

  return (
    <>
      {geoData.wards && <TokyoHighlight data={geoData.wards} />}
      {layers.prefBorders && geoData.prefBorders && <PrefBorderLayer data={geoData.prefBorders} />}
      {layers.wards && geoData.wards && <WardLayer data={geoData.wards} />}
      {geoData.railLines && lineIndex.length > 0 && (
        <RailLineWithStations
          railGeoData={geoData.railLines}
          lineIndex={lineIndex}
          visibleLines={layers.railLines}
        />
      )}
      {layers.rivers && geoData.rivers && <RiverLayer data={geoData.rivers} />}
      {layers.roads && geoData.roads && <RoadLayer data={geoData.roads} />}
      {layers.landmarks && geoData.landmarks && <LandmarkLayer data={geoData.landmarks} />}
      <DistancePolyline />
    </>
  );
}
