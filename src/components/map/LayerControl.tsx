import { useState, useEffect } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { loadLineIndex } from '@/utils/dataLoader';

interface LineInfo {
  key: string;
  name: string;
  abbr: string;
  color: string;
  stationCount: number;
}

const OPERATOR_LABELS: Record<string, string> = {
  JR: 'JR東日本',
  Metro: '東京メトロ',
  Toei: '都営',
  Keio: '京王電鉄',
  Odakyu: '小田急電鉄',
  Tokyu: '東急電鉄',
  Seibu: '西武鉄道',
  Keikyu: '京浜急行',
  Tobu: '東武鉄道',
  TX: 'つくばEX',
  Keisei: '京成電鉄',
  Yurikamome: 'ゆりかもめ',
  TWR: 'りんかい線',
  TamaMonorail: '多摩モノレール',
};

const OPERATOR_ORDER = [
  'JR',
  'Metro',
  'Toei',
  'Keio',
  'Odakyu',
  'Tokyu',
  'Seibu',
  'Keikyu',
  'Tobu',
  'TX',
  'Keisei',
  'Yurikamome',
  'TWR',
  'TamaMonorail',
];

export default function LayerControl() {
  const layers = useMapStore((s) => s.layers);
  const toggleLayer = useMapStore((s) => s.toggleLayer);
  const toggleRailLine = useMapStore((s) => s.toggleRailLine);
  const toggleOperator = useMapStore((s) => s.toggleOperator);

  const [linesByOp, setLinesByOp] = useState<Record<string, LineInfo[]>>({});
  const [expandedOps, setExpandedOps] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadLineIndex().then((data) => {
      const mapped: Record<string, LineInfo[]> = {};
      for (const [op, entries] of Object.entries(data.byOperator)) {
        mapped[op] = entries.map((e) => ({
          key: e.key,
          name: e.name,
          abbr: e.abbr,
          color: e.color,
          stationCount: e.stationCount,
        }));
      }
      setLinesByOp(mapped);
    });
  }, []);

  const toggleOpExpand = (op: string) => {
    setExpandedOps((prev) => ({ ...prev, [op]: !prev[op] }));
  };

  const isOperatorAllOn = (op: string): boolean => {
    const opLines = linesByOp[op] || [];
    return opLines.length > 0 && opLines.every((l) => !!layers.railLines[l.key]);
  };

  const isOperatorSomeOn = (op: string): boolean => {
    const opLines = linesByOp[op] || [];
    return opLines.some((l) => !!layers.railLines[l.key]);
  };

  const handleOperatorToggle = (op: string) => {
    const opLines = linesByOp[op] || [];
    const keys = opLines.map((l) => l.key);
    toggleOperator(op, keys, !isOperatorAllOn(op));
  };

  const basicLayers: {
    key: 'wards' | 'prefBorders' | 'rivers' | 'roads' | 'landmarks';
    label: string;
  }[] = [
    { key: 'wards', label: '区/市境界' },
    { key: 'prefBorders', label: '都道府県境界' },
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
        <div className="layer-control__section-title">路線</div>
        {OPERATOR_ORDER.filter((op) => linesByOp[op]?.length).map((op) => {
          const opLines = linesByOp[op] || [];
          const expanded = !!expandedOps[op];
          const allOn = isOperatorAllOn(op);
          const someOn = isOperatorSomeOn(op);

          return (
            <div key={op} className="layer-control__operator">
              <div className="layer-control__operator-header">
                <button className="layer-control__expand-btn" onClick={() => toggleOpExpand(op)}>
                  {expanded ? '▼' : '▶'}
                </button>
                <label className="layer-control__operator-label">
                  <input
                    type="checkbox"
                    checked={allOn}
                    ref={(el) => {
                      if (el) el.indeterminate = someOn && !allOn;
                    }}
                    onChange={() => handleOperatorToggle(op)}
                  />
                  <span>{OPERATOR_LABELS[op] || op}</span>
                </label>
              </div>

              {expanded && (
                <div className="layer-control__line-list">
                  {opLines.map((line) => (
                    <label key={line.key} className="layer-control__item layer-control__item--line">
                      <input
                        type="checkbox"
                        checked={!!layers.railLines[line.key]}
                        onChange={() => toggleRailLine(line.key)}
                      />
                      <span
                        className="layer-control__line-badge"
                        style={{
                          borderColor: line.color,
                          color: line.color,
                          backgroundColor: `${line.color}15`,
                        }}
                      >
                        {line.abbr}
                      </span>
                      <span className="layer-control__line-name">{line.name}</span>
                      <span className="layer-control__station-count">{line.stationCount}駅</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
