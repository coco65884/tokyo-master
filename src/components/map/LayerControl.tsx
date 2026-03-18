import { useState } from 'react';
import { useMapStore } from '@/stores/mapStore';

const RAIL_OPERATORS = [
  { key: 'JR', label: 'JR東日本', color: '#008000' },
  { key: 'Metro', label: '東京メトロ', color: '#009bbf' },
  { key: 'Toei', label: '都営地下鉄', color: '#e85298' },
  { key: 'Keio', label: '京王電鉄', color: '#dd0077' },
  { key: 'Odakyu', label: '小田急電鉄', color: '#1e90ff' },
  { key: 'Tokyu', label: '東急電鉄', color: '#da0442' },
  { key: 'Seibu', label: '西武鉄道', color: '#00498b' },
  { key: 'Keikyu', label: '京浜急行', color: '#e8334a' },
  { key: 'Tobu', label: '東武鉄道', color: '#0f378e' },
  { key: 'TX', label: 'つくばEX', color: '#2e3192' },
  { key: 'Keisei', label: '京成電鉄', color: '#003399' },
  { key: 'Yurikamome', label: 'ゆりかもめ', color: '#009fa1' },
  { key: 'TWR', label: 'りんかい線', color: '#00b5ad' },
  { key: 'TamaMonorail', label: '多摩モノレール', color: '#ff7f00' },
];

export default function LayerControl() {
  const layers = useMapStore((s) => s.layers);
  const toggleLayer = useMapStore((s) => s.toggleLayer);
  const toggleRailLine = useMapStore((s) => s.toggleRailLine);
  const [railExpanded, setRailExpanded] = useState(false);

  const basicLayers: {
    key: 'wards' | 'prefBorders' | 'rivers' | 'roads' | 'landmarks' | 'stations';
    label: string;
  }[] = [
    { key: 'wards', label: '区/市境界' },
    { key: 'prefBorders', label: '都道府県境界' },
    { key: 'stations', label: '駅' },
    { key: 'rivers', label: '川' },
    { key: 'roads', label: '主要道路' },
    { key: 'landmarks', label: '観光地' },
  ];

  return (
    <div className="layer-control">
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

      <div className="layer-control__section">
        <button
          className="layer-control__expand-btn"
          onClick={() => setRailExpanded(!railExpanded)}
        >
          {railExpanded ? '▼' : '▶'} 路線
        </button>

        {railExpanded && (
          <div className="layer-control__rail-list">
            {RAIL_OPERATORS.map(({ key, label, color }) => (
              <label key={key} className="layer-control__item layer-control__item--rail">
                <input
                  type="checkbox"
                  checked={!!layers.railLines[key]}
                  onChange={() => toggleRailLine(key)}
                />
                <span className="layer-control__color-dot" style={{ backgroundColor: color }} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
