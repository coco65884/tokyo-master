import { useEffect, useState, useMemo } from 'react';
import { GeoJSON, CircleMarker, Polyline, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { FeatureCollection, Feature } from 'geojson';
import { useMapStore } from '@/stores/mapStore';
import {
  loadWards,
  loadPrefBorders,
  loadRailLines,
  loadStations,
  loadRivers,
  loadRoads,
  loadLandmarks,
} from '@/utils/dataLoader';

interface GeoData {
  wards: FeatureCollection | null;
  prefBorders: FeatureCollection | null;
  railLines: FeatureCollection | null;
  stations: FeatureCollection | null;
  rivers: FeatureCollection | null;
  roads: FeatureCollection | null;
  landmarks: FeatureCollection | null;
}

function useGeoData(layers: {
  wards: boolean;
  prefBorders: boolean;
  railLines: Record<string, boolean>;
  rivers: boolean;
  roads: boolean;
  landmarks: boolean;
  stations: boolean;
}): GeoData {
  const [data, setData] = useState<GeoData>({
    wards: null,
    prefBorders: null,
    railLines: null,
    stations: null,
    rivers: null,
    roads: null,
    landmarks: null,
  });

  useEffect(() => {
    if (layers.wards && !data.wards) loadWards().then((d) => setData((p) => ({ ...p, wards: d })));
  }, [layers.wards, data.wards]);

  useEffect(() => {
    if (layers.prefBorders && !data.prefBorders)
      loadPrefBorders().then((d) => setData((p) => ({ ...p, prefBorders: d })));
  }, [layers.prefBorders, data.prefBorders]);

  useEffect(() => {
    if (Object.values(layers.railLines).some(Boolean) && !data.railLines)
      loadRailLines().then((d) => setData((p) => ({ ...p, railLines: d })));
  }, [layers.railLines, data.railLines]);

  useEffect(() => {
    if (layers.stations && !data.stations)
      loadStations().then((d) => setData((p) => ({ ...p, stations: d })));
  }, [layers.stations, data.stations]);

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

/** 現在のズームレベルを追跡するフック */
function useZoomLevel(): number {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useEffect(() => {
    const handler = () => setZoom(map.getZoom());
    map.on('zoomend', handler);
    return () => {
      map.off('zoomend', handler);
    };
  }, [map]);

  return zoom;
}

// --- Ward Layer: 白背景に薄い境界線、ホバーでハイライト ---
function WardLayer({ data }: { data: FeatureCollection }) {
  const setSelectedWard = useMapStore((s) => s.setSelectedWard);
  const map = useMap();

  const onEachFeature = (feature: Feature, layer: L.Layer) => {
    const name = feature.properties?.name || '';
    const path = layer as L.Path;

    path.bindTooltip(name, {
      sticky: true,
      className: 'ward-tooltip',
      direction: 'center',
    });

    path.on('mouseover', () => {
      path.setStyle({
        fillColor: '#a8d8ea',
        fillOpacity: 0.35,
        weight: 2.5,
        color: '#4a90d9',
      });
      path.bringToFront();
    });

    path.on('mouseout', () => {
      path.setStyle({
        fillColor: '#f8fbff',
        fillOpacity: 0.15,
        weight: 1,
        color: '#94a3b8',
      });
    });

    path.on('click', () => {
      setSelectedWard(feature.properties?.id);
      const bounds = (layer as L.Polygon).getBounds();
      map.fitBounds(bounds, { padding: [50, 50] });
    });
  };

  return (
    <GeoJSON
      key="wards"
      data={data}
      style={{
        color: '#94a3b8',
        weight: 1,
        fillColor: '#f8fbff',
        fillOpacity: 0.15,
      }}
      onEachFeature={onEachFeature}
    />
  );
}

// --- Pref Border: 控えめだが明確な境界線 ---
function PrefBorderLayer({ data }: { data: FeatureCollection }) {
  return (
    <GeoJSON
      key="pref-borders"
      data={data}
      style={{
        color: '#64748b',
        weight: 2.5,
        opacity: 0.6,
        dashArray: '10, 6',
      }}
    />
  );
}

// --- Rail Line: 鮮やかな路線カラー ---
function RailLineLayer({
  data,
  visibleLines,
}: {
  data: FeatureCollection;
  visibleLines: Record<string, boolean>;
}) {
  const filteredFeatures = useMemo(() => {
    const enabledOperators = new Set(
      Object.entries(visibleLines)
        .filter(([, v]) => v)
        .map(([k]) => k),
    );
    if (enabledOperators.size === 0) return null;

    return {
      ...data,
      features: data.features.filter((f) => enabledOperators.has(f.properties?.operator)),
    } as FeatureCollection;
  }, [data, visibleLines]);

  if (!filteredFeatures) return null;

  return (
    <GeoJSON
      key={`rail-${JSON.stringify(visibleLines)}`}
      data={filteredFeatures}
      style={(feature) => ({
        color: feature?.properties?.color || '#888',
        weight: 3.5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
      })}
      onEachFeature={(feature, layer) => {
        const name = feature.properties?.name || '';
        (layer as L.Path).bindTooltip(name, {
          sticky: true,
          className: 'rail-tooltip',
        });
      }}
    />
  );
}

// --- Station: ズームレベルに応じて表示を変える ---
function StationLayer({ data }: { data: FeatureCollection }) {
  const zoom = useZoomLevel();
  const showLabels = zoom >= 13;
  const radius = zoom >= 14 ? 5 : zoom >= 12 ? 3.5 : 2.5;

  return (
    <>
      {data.features.map((feature) => {
        const coords = (feature.geometry as GeoJSON.Point).coordinates;
        const name = feature.properties?.name || '';
        return (
          <CircleMarker
            key={feature.properties?.id}
            center={[coords[1], coords[0]]}
            radius={radius}
            pathOptions={{
              color: '#1a73e8',
              fillColor: '#ffffff',
              fillOpacity: 1,
              weight: 1.5,
            }}
          >
            {showLabels ? (
              <Tooltip permanent direction="top" offset={[0, -6]} className="station-label">
                {name}
              </Tooltip>
            ) : (
              <Popup>
                <strong>{name}</strong>
              </Popup>
            )}
          </CircleMarker>
        );
      })}
    </>
  );
}

// --- River: 鮮やかな青 ---
function RiverLayer({ data }: { data: FeatureCollection }) {
  return (
    <GeoJSON
      key="rivers"
      data={data}
      style={{
        color: '#38bdf8',
        weight: 2.5,
        opacity: 0.8,
        lineCap: 'round',
      }}
      onEachFeature={(feature, layer) => {
        const name = feature.properties?.name || '';
        (layer as L.Path).bindTooltip(name, {
          sticky: true,
          className: 'river-tooltip',
        });
      }}
    />
  );
}

// --- Road: 暖色系 ---
function RoadLayer({ data }: { data: FeatureCollection }) {
  return (
    <GeoJSON
      key="roads"
      data={data}
      style={{
        color: '#fb923c',
        weight: 2,
        opacity: 0.7,
        lineCap: 'round',
      }}
      onEachFeature={(feature, layer) => {
        const name = feature.properties?.name || '';
        (layer as L.Path).bindTooltip(name, {
          sticky: true,
          className: 'road-tooltip',
        });
      }}
    />
  );
}

// --- Landmark: ポップなアイコン ---
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
        const name = feature.properties?.name || '';
        return (
          <Marker
            key={feature.properties?.id}
            position={[coords[1], coords[0]]}
            icon={landmarkIcon}
          >
            <Popup>
              <strong>{name}</strong>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

// --- Distance ---
function DistancePolyline() {
  const points = useMapStore((s) => s.distancePoints);
  if (points.length < 2) return null;

  return (
    <Polyline
      positions={points as [number, number][]}
      pathOptions={{
        color: '#e91e63',
        weight: 2.5,
        dashArray: '8, 6',
        opacity: 0.9,
      }}
    />
  );
}

export default function MapLayers() {
  const layers = useMapStore((s) => s.layers);
  const geoData = useGeoData(layers);

  return (
    <>
      {layers.prefBorders && geoData.prefBorders && <PrefBorderLayer data={geoData.prefBorders} />}
      {layers.wards && geoData.wards && <WardLayer data={geoData.wards} />}
      {geoData.railLines && (
        <RailLineLayer data={geoData.railLines} visibleLines={layers.railLines} />
      )}
      {layers.rivers && geoData.rivers && <RiverLayer data={geoData.rivers} />}
      {layers.roads && geoData.roads && <RoadLayer data={geoData.roads} />}
      {layers.stations && geoData.stations && <StationLayer data={geoData.stations} />}
      {layers.landmarks && geoData.landmarks && <LandmarkLayer data={geoData.landmarks} />}
      <DistancePolyline />
    </>
  );
}
