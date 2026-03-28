import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import TokyoMap from '@/components/map/TokyoMap';
import LayerControl from '@/components/map/LayerControl';
import WardSelector from '@/components/map/WardSelector';
import DistanceDisplay from '@/components/map/DistanceDisplay';
import GenreSelector from '@/components/map/GenreSelector';
import MobileMapMenu from '@/components/map/MobileMapMenu';
import { useMapStore } from '@/stores/mapStore';
import BannerAd from '@/components/ads/BannerAd';
import '@/styles/MapViewerPage.css';

const MOBILE_BREAKPOINT = 768;

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT,
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
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
  const isMobile = useIsMobile();

  // ページ遷移後に戻ってきたときに前のフォーカスが残らないようクリア
  useEffect(() => {
    setSelectedWard(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectWard = useCallback(
    (wardId: string | null) => {
      setSelectedWard(wardId);
    },
    [setSelectedWard],
  );

  return (
    <div className="map-viewer-page">
      {/* Desktop sidebar - hidden on mobile via CSS */}
      <aside className="map-sidebar">
        <Link to="/" className="back-link">
          ← ホーム
        </Link>
        <h2 className="map-sidebar__title">地理確認</h2>
        <WardSelector onSelectWard={handleSelectWard} />
        <HeatmapToggle />
        <LayerControl />
        <GenreSelector />
        <DistanceDisplay />
      </aside>
      <main className="map-main">
        <TokyoMap />
        {/* Mobile home button */}
        {isMobile && (
          <Link to="/" className="mobile-home-btn" aria-label="ホームに戻る">
            &#8592;
          </Link>
        )}
        {/* Mobile bottom menu */}
        {isMobile && <MobileMapMenu onSelectWard={handleSelectWard} />}
        {/* バナー広告（最下部に固定表示） */}
        {isMobile && <BannerAd />}
      </main>
    </div>
  );
}
