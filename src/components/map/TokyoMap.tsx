import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import { useMapStore } from '@/stores/mapStore';
import MapLayers from './MapLayers';
import HeatmapOverlay from './HeatmapOverlay';
import 'leaflet/dist/leaflet.css';

const TOKYO_DEFAULT_BOUNDS: LatLngBoundsExpression = [
  [35.15, 138.85],
  [36.0, 140.05],
];

const EXTENDED_BOUNDS: LatLngBoundsExpression = [
  [34.0, 137.5],
  [37.0, 141.0],
];

function MapClickHandler() {
  const distanceMode = useMapStore((s) => s.distanceMode);
  const addDistancePoint = useMapStore((s) => s.addDistancePoint);

  useMapEvents({
    click(e) {
      if (distanceMode) {
        addDistancePoint([e.latlng.lat, e.latlng.lng]);
      }
    },
  });

  return null;
}

/** 距離モード: 1点目を打った後、マウスカーソルまで破線を描画（デスクトップのみ） */
function DistanceCursorLine() {
  const distanceMode = useMapStore((s) => s.distanceMode);
  const points = useMapStore((s) => s.distancePoints);
  const [cursorPos, setCursorPos] = useState<[number, number] | null>(null);

  // タッチデバイス判定（coarse pointer = タッチ）
  const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  useMapEvents({
    mousemove(e) {
      if (distanceMode && points.length === 1 && !isTouch) {
        setCursorPos([e.latlng.lat, e.latlng.lng]);
      }
    },
  });

  if (!distanceMode || points.length !== 1 || !cursorPos || isTouch) return null;

  return (
    <Polyline
      positions={[points[0], cursorPos]}
      pathOptions={{ color: '#e91e63', weight: 1.5, dashArray: '6, 6', opacity: 0.6 }}
    />
  );
}

/** 距離モード中にカーソルをクロスヘアに変更 */
function DistanceCursorManager() {
  const distanceMode = useMapStore((s) => s.distanceMode);
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    if (distanceMode) {
      container.classList.add('distance-mode-cursor');
    } else {
      container.classList.remove('distance-mode-cursor');
    }
    return () => {
      container.classList.remove('distance-mode-cursor');
    };
  }, [distanceMode, map]);

  return null;
}

/** 路線選択時にmaxBoundsとminZoomを拡張 */
function DynamicBounds() {
  const map = useMap();
  const layers = useMapStore((s) => s.layers);
  const hasActiveRail = useMemo(
    () => Object.values(layers.railLines).some(Boolean),
    [layers.railLines],
  );

  useEffect(() => {
    if (hasActiveRail) {
      map.setMaxBounds(L.latLngBounds(EXTENDED_BOUNDS as L.LatLngBoundsLiteral));
      map.setMinZoom(7);
    } else {
      map.setMaxBounds(L.latLngBounds(TOKYO_DEFAULT_BOUNDS as L.LatLngBoundsLiteral));
      map.setMinZoom(9);
    }
  }, [hasActiveRail, map]);

  return null;
}

export default function TokyoMap() {
  const center = useMapStore((s) => s.center);
  const zoom = useMapStore((s) => s.zoom);

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      minZoom={9}
      maxZoom={18}
      maxBounds={TOKYO_DEFAULT_BOUNDS}
      maxBoundsViscosity={0.8}
      doubleClickZoom={false}
      scrollWheelZoom={true}
      wheelDebounceTime={80}
      wheelPxPerZoomLevel={200}
      zoomSnap={0.5}
      zoomDelta={0.5}
      className="tokyo-map"
      style={{ width: '100%', height: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
      />
      <MapLayers />
      <HeatmapOverlay />
      <MapClickHandler />
      <DistanceCursorLine />
      <DistanceCursorManager />
      <DynamicBounds />
    </MapContainer>
  );
}
