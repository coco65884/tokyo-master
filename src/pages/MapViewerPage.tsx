import { Link } from 'react-router-dom';
import TokyoMap from '@/components/map/TokyoMap';
import LayerControl from '@/components/map/LayerControl';
import WardSelector from '@/components/map/WardSelector';
import DistanceDisplay from '@/components/map/DistanceDisplay';
import { useMapStore } from '@/stores/mapStore';
import '@/styles/MapViewerPage.css';

function WardFocusToggle() {
  const wardFocusMode = useMapStore((s) => s.wardFocusMode);
  const setWardFocusMode = useMapStore((s) => s.setWardFocusMode);
  const selectedWardId = useMapStore((s) => s.selectedWardId);

  return (
    <div className="ward-focus-toggle">
      <div className="ward-focus-toggle__header">
        <span className="ward-focus-toggle__label">区フォーカス</span>
        <button
          className={`ward-focus-toggle__btn ${wardFocusMode ? 'ward-focus-toggle__btn--active' : ''}`}
          onClick={() => setWardFocusMode(!wardFocusMode)}
        >
          {wardFocusMode ? 'ON' : 'OFF'}
        </button>
      </div>
      {wardFocusMode && (
        <p className="ward-focus-toggle__hint">
          {selectedWardId
            ? '選択中の区を通る路線・川・道路を表示中'
            : '区をダブルクリックまたは選択してください'}
        </p>
      )}
    </div>
  );
}

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
        <WardFocusToggle />
        <LayerControl />
        <DistanceDisplay />
      </aside>
      <main className="map-main">
        <TokyoMap />
      </main>
    </div>
  );
}
