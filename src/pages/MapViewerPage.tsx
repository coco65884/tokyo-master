import TokyoMap from '@/components/map/TokyoMap';
import LayerControl from '@/components/map/LayerControl';
import DistanceDisplay from '@/components/map/DistanceDisplay';
import '@/styles/MapViewerPage.css';

export default function MapViewerPage() {
  return (
    <div className="map-viewer-page">
      <aside className="map-sidebar">
        <h2 className="map-sidebar__title">レイヤー</h2>
        <LayerControl />
        <DistanceDisplay />
      </aside>
      <main className="map-main">
        <TokyoMap />
      </main>
    </div>
  );
}
