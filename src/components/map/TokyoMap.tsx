import { MapContainer, TileLayer, useMapEvents } from 'react-leaflet';
import { useMapStore } from '@/stores/mapStore';
import 'leaflet/dist/leaflet.css';

function MapClickHandler() {
  const addDistancePoint = useMapStore((s) => s.addDistancePoint);

  useMapEvents({
    click(e) {
      addDistancePoint([e.latlng.lat, e.latlng.lng]);
    },
  });

  return null;
}

export default function TokyoMap() {
  const center = useMapStore((s) => s.center);
  const zoom = useMapStore((s) => s.zoom);

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className="tokyo-map"
      style={{ width: '100%', height: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapClickHandler />
    </MapContainer>
  );
}
