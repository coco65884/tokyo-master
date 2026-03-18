import { Link } from 'react-router-dom';
import TokyoMap from '@/components/map/TokyoMap';
import LayerControl from '@/components/map/LayerControl';
import WardSelector from '@/components/map/WardSelector';
import DistanceDisplay from '@/components/map/DistanceDisplay';
import { useMapStore } from '@/stores/mapStore';
import '@/styles/MapViewerPage.css';

export default function MapViewerPage() {
  const setSelectedWard = useMapStore((s) => s.setSelectedWard);

  return (
    <div className="map-viewer-page">
      <aside className="map-sidebar">
        <Link to="/" className="back-link">
          ← ホーム
        </Link>
        <h2 className="map-sidebar__title">地理確認</h2>
        <WardSelector onSelectWard={setSelectedWard} />
        <LayerControl />
        <DistanceDisplay />
      </aside>
      <main className="map-main">
        <TokyoMap />
      </main>
    </div>
  );
}
