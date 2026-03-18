import { useEffect, useState, useMemo } from 'react';
import { GeoJSON, CircleMarker, Polyline, Marker, Popup, useMap } from 'react-leaflet';
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

function WardLayer({ data }: { data: FeatureCollection }) {
  const setSelectedWard = useMapStore((s) => s.setSelectedWard);
  const map = useMap();

  const onEachFeature = (feature: Feature, layer: L.Layer) => {
    const name = feature.properties?.name || '';
    (layer as L.Path).bindTooltip(name, { sticky: true });
    (layer as L.Path).on('click', () => {
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
        color: '#555',
        weight: 1.5,
        fillColor: '#e8f4f8',
        fillOpacity: 0.1,
      }}
      onEachFeature={onEachFeature}
    />
  );
}

function PrefBorderLayer({ data }: { data: FeatureCollection }) {
  return (
    <GeoJSON
      key="pref-borders"
      data={data}
      style={{
        color: '#d32f2f',
        weight: 3,
        dashArray: '8, 4',
        opacity: 0.8,
      }}
    />
  );
}

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
        weight: 3,
        opacity: 0.8,
      })}
      onEachFeature={(feature, layer) => {
        const name = feature.properties?.name || '';
        (layer as L.Path).bindTooltip(name, { sticky: true });
      }}
    />
  );
}

function StationLayer({ data }: { data: FeatureCollection }) {
  return (
    <>
      {data.features.map((feature) => {
        const coords = (feature.geometry as GeoJSON.Point).coordinates;
        const name = feature.properties?.name || '';
        return (
          <CircleMarker
            key={feature.properties?.id}
            center={[coords[1], coords[0]]}
            radius={4}
            pathOptions={{
              color: '#1a73e8',
              fillColor: '#fff',
              fillOpacity: 1,
              weight: 2,
            }}
          >
            <Popup>
              <strong>{name}</strong>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

function RiverLayer({ data }: { data: FeatureCollection }) {
  return (
    <GeoJSON
      key="rivers"
      data={data}
      style={{
        color: '#2196f3',
        weight: 2.5,
        opacity: 0.7,
      }}
      onEachFeature={(feature, layer) => {
        const name = feature.properties?.name || '';
        (layer as L.Path).bindTooltip(name, { sticky: true });
      }}
    />
  );
}

function RoadLayer({ data }: { data: FeatureCollection }) {
  return (
    <GeoJSON
      key="roads"
      data={data}
      style={{
        color: '#ff9800',
        weight: 2,
        opacity: 0.6,
      }}
      onEachFeature={(feature, layer) => {
        const name = feature.properties?.name || '';
        (layer as L.Path).bindTooltip(name, { sticky: true });
      }}
    />
  );
}

const landmarkIcon = L.divIcon({
  className: 'landmark-icon',
  html: '<span style="font-size:18px">📍</span>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
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

function DistancePolyline() {
  const points = useMapStore((s) => s.distancePoints);
  if (points.length < 2) return null;

  return (
    <Polyline
      positions={points as [number, number][]}
      pathOptions={{ color: '#e91e63', weight: 2, dashArray: '6, 4' }}
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
