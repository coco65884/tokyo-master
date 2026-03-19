import { useState, useCallback } from 'react';
import WardSelector from '@/components/map/WardSelector';
import LayerControl from '@/components/map/LayerControl';
import GenreSelector from '@/components/map/GenreSelector';
import DistanceDisplay from '@/components/map/DistanceDisplay';
import { useMapStore } from '@/stores/mapStore';

type TabId = 'ward' | 'rail' | 'display' | 'theme' | 'distance';

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { id: 'ward', label: '区/市', icon: '🏙' },
  { id: 'rail', label: '路線', icon: '🚃' },
  { id: 'display', label: '表示', icon: '🗺' },
  { id: 'theme', label: 'テーマ', icon: '📍' },
  { id: 'distance', label: '距離', icon: '📏' },
];

/** Extracts only the basic layer toggles (wards, prefBorders, rivers, roads)
 *  from LayerControl. We render the full LayerControl in "rail" tab and a
 *  simplified version in "display" tab. */
function BasicLayerToggles() {
  const layers = useMapStore((s) => s.layers);
  const toggleLayer = useMapStore((s) => s.toggleLayer);

  const basicLayers: {
    key: 'wards' | 'prefBorders' | 'rivers' | 'roads';
    label: string;
  }[] = [
    { key: 'wards', label: '区/市境界' },
    { key: 'prefBorders', label: '都道府県境界' },
    { key: 'rivers', label: '川' },
    { key: 'roads', label: '主要道路' },
  ];

  return (
    <div className="mobile-basic-layers">
      {basicLayers.map(({ key, label }) => (
        <label key={key} className="layer-control__item">
          <input
            type="checkbox"
            checked={layers[key] as boolean}
            onChange={() => toggleLayer(key)}
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}

function HeatmapToggleMobile() {
  const showHeatmap = useMapStore((s) => s.showHeatmap);
  const setShowHeatmap = useMapStore((s) => s.setShowHeatmap);

  return (
    <div className="mobile-heatmap-toggle">
      <label className="layer-control__item">
        <input
          type="checkbox"
          checked={showHeatmap}
          onChange={() => setShowHeatmap(!showHeatmap)}
        />
        <span>正答率ヒートマップ</span>
      </label>
    </div>
  );
}

export default function MobileMapMenu({
  onSelectWard,
}: {
  onSelectWard: (wardId: string | null) => void;
}) {
  const [activeTab, setActiveTab] = useState<TabId | null>(null);

  const handleTabClick = useCallback((tabId: TabId) => {
    setActiveTab((prev) => (prev === tabId ? null : tabId));
  }, []);

  const handleBackdropClick = useCallback(() => {
    setActiveTab(null);
  }, []);

  return (
    <>
      {/* Backdrop overlay */}
      {activeTab && <div className="mobile-backdrop" onClick={handleBackdropClick} />}

      {/* Bottom panel */}
      <div className={`mobile-panel ${activeTab ? 'mobile-panel--open' : ''}`}>
        <div className="mobile-panel__content">
          {activeTab === 'ward' && (
            <div className="mobile-panel__section">
              <WardSelector onSelectWard={onSelectWard} />
            </div>
          )}
          {activeTab === 'rail' && (
            <div className="mobile-panel__section">
              <LayerControl />
            </div>
          )}
          {activeTab === 'display' && (
            <div className="mobile-panel__section">
              <BasicLayerToggles />
              <HeatmapToggleMobile />
            </div>
          )}
          {activeTab === 'theme' && (
            <div className="mobile-panel__section">
              <GenreSelector />
            </div>
          )}
          {activeTab === 'distance' && (
            <div className="mobile-panel__section">
              <DistanceDisplay />
            </div>
          )}
        </div>
      </div>

      {/* Bottom tab bar */}
      <nav className="mobile-tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`mobile-tab-bar__tab ${activeTab === tab.id ? 'mobile-tab-bar__tab--active' : ''}`}
            onClick={() => handleTabClick(tab.id)}
          >
            <span className="mobile-tab-bar__icon">{tab.icon}</span>
            <span className="mobile-tab-bar__label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
