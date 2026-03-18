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

function HeatmapToggle() {
  const showHeatmap = useMapStore((s) => s.showHeatmap);
  const setShowHeatmap = useMapStore((s) => s.setShowHeatmap);

  return (
    <div className="heatmap-toggle">
      <div className="heatmap-toggle__header">
        <span className="heatmap-toggle__label">正答率ヒートマップ</span>
        <button
          className={`ward-focus-toggle__btn ${showHeatmap ? 'ward-focus-toggle__btn--active' : ''}`}
          onClick={() => setShowHeatmap(!showHeatmap)}
        >
          {showHeatmap ? 'ON' : 'OFF'}
        </button>
      </div>
      {showHeatmap && <p className="ward-focus-toggle__hint">区クイズの正答率を色で表示中</p>}
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
        <HeatmapToggle />
        <LayerControl />
        <DistanceDisplay />
      </aside>
      <main className="map-main">
        <TokyoMap />
      </main>
    </div>
  );
}
