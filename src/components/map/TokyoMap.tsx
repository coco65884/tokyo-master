import { useEffect } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import { useMapStore } from '@/stores/mapStore';
import MapLayers from './MapLayers';
import 'leaflet/dist/leaflet.css';

const TOKYO_MAX_BOUNDS: LatLngBoundsExpression = [
  [35.15, 138.85],
  [36.0, 140.05],
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

export default function TokyoMap() {
  const center = useMapStore((s) => s.center);
  const zoom = useMapStore((s) => s.zoom);

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      minZoom={9}
      maxZoom={18}
      maxBounds={TOKYO_MAX_BOUNDS}
      maxBoundsViscosity={0.8}
      doubleClickZoom={false}
      className="tokyo-map"
      style={{ width: '100%', height: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
      />
      <MapLayers />
      <MapClickHandler />
      <DistanceCursorManager />
    </MapContainer>
  );
}
