import { useRef, useCallback, useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import type { AchievementDefinition, UserAchievement } from '@/types';
import type { FeatureCollection } from 'geojson';

type DifficultyTab = 'kantan' | 'futsuu' | 'muzukashii';
const DIFF_TABS: { key: DifficultyTab; label: string; color: string }[] = [
  { key: 'kantan', label: 'かんたん', color: '#cd7f32' },
  { key: 'futsuu', label: 'ふつう', color: '#a8a8a8' },
  { key: 'muzukashii', label: 'むずかしい', color: '#ffd700' },
];

interface Props {
  definition: AchievementDefinition;
  /** 難易度別の達成状況 */
  achievementsByDifficulty?: Record<string, UserAchievement | undefined>;
  /** 初期表示する難易度タブ */
  initialDifficulty?: DifficultyTab;
  onClose: () => void;
}

export default function ShareCard({
  definition,
  achievementsByDifficulty,
  initialDifficulty,
  onClose,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [generating, setGenerating] = useState(false);
  const [diffTab, setDiffTab] = useState<DifficultyTab>(initialDifficulty ?? 'futsuu');

  const userAchievement = achievementsByDifficulty?.[diffTab];
  const achieved = userAchievement?.achieved ?? false;
  const bestAccuracy = userAchievement?.bestAccuracy ?? 0;
  const achievedAt = userAchievement?.achievedAt;
  const attempts = userAchievement?.attempts ?? 0;
  const isLine = definition.scopeType === 'line';

  // 路線アチーブメント用: 簡易地図SVGデータ
  const [miniMapSvg, setMiniMapSvg] = useState<string>('');
  useEffect(() => {
    if (!isLine) return;
    Promise.all([
      fetch('/data/geojson/rail_lines.geojson').then((r) => r.json()),
      fetch('/data/line_index.json').then((r) => r.json()),
    ])
      .then(
        ([railGeo, lineIndex]: [
          FeatureCollection,
          { lines: Array<{ key: string; lineIds: string[]; color: string }> },
        ]) => {
          const line = lineIndex.lines.find((l) => l.key === definition.scopeId);
          if (!line) return;
          const lineIds = new Set(line.lineIds);

          // Build SVG paths
          const SVG_W = 120;
          const SVG_H = 100;
          const LAT_MIN = 35.5;
          const LAT_MAX = 35.85;
          const LNG_MIN = 139.4;
          const LNG_MAX = 139.95;

          const toSvg = (lng: number, lat: number): [number, number] => [
            ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * SVG_W,
            ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * SVG_H,
          ];

          // All lines (gray) + target line (color)
          let allPaths = '';
          let targetPaths = '';

          for (const feat of railGeo.features) {
            const fid = (feat.properties as Record<string, string>)?.id;
            const geom = feat.geometry;
            const segs: number[][][] =
              geom.type === 'LineString'
                ? [geom.coordinates as number[][]]
                : geom.type === 'MultiLineString'
                  ? (geom.coordinates as number[][][])
                  : [];

            for (const seg of segs) {
              const points = seg
                .filter(
                  (c) => c[0] >= LNG_MIN && c[0] <= LNG_MAX && c[1] >= LAT_MIN && c[1] <= LAT_MAX,
                )
                .map((c) => toSvg(c[0], c[1]));
              if (points.length < 2) continue;
              const d = points
                .map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
                .join('');
              if (lineIds.has(fid ?? '')) {
                targetPaths += `<path d="${d}" stroke="${definition.color}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
              } else {
                allPaths += `<path d="${d}" stroke="#d1d5db" stroke-width="0.8" fill="none" opacity="0.5"/>`;
              }
            }
          }

          setMiniMapSvg(
            `<svg viewBox="0 0 ${SVG_W} ${SVG_H}" xmlns="http://www.w3.org/2000/svg">${allPaths}${targetPaths}</svg>`,
          );
        },
      )
      .catch(() => {});
  }, [isLine, definition.scopeId, definition.color]);

  const formatDate = (iso: string): string => {
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  };

  const generateImage = useCallback(async (): Promise<HTMLCanvasElement | null> => {
    if (!cardRef.current) return null;
    setGenerating(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
      });
      return canvas;
    } finally {
      setGenerating(false);
    }
  }, []);

  const handleDownload = useCallback(async () => {
    const canvas = await generateImage();
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `tokyo-master-${definition.id.replace(/[:/]/g, '-')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [generateImage, definition.id]);

  const handleShareX = useCallback(() => {
    const text = achieved
      ? `${definition.title}を達成しました！（正答率 ${Math.round(bestAccuracy * 100)}%）`
      : `${definition.title}に挑戦中！（ベスト ${Math.round(bestAccuracy * 100)}%）`;
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(text + '\n#TokyoMaster')}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [achieved, definition.title, bestAccuracy]);

  const handleShareLINE = useCallback(() => {
    const text = achieved
      ? `${definition.title}を達成しました！（正答率 ${Math.round(bestAccuracy * 100)}%）`
      : `${definition.title}に挑戦中！（ベスト ${Math.round(bestAccuracy * 100)}%）`;
    const url = `https://social-plugins.line.me/lineit/share?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [achieved, definition.title, bestAccuracy]);

  return (
    <div className="share-overlay" onClick={onClose}>
      <div className="share-modal" onClick={(e) => e.stopPropagation()}>
        {/* Capturable card */}
        <div ref={cardRef} className="share-card">
          <div className="share-card__header" style={{ backgroundColor: definition.color }}>
            <span className="share-card__icon">{definition.icon}</span>
            <span className="share-card__title">{definition.title}</span>
          </div>
          {/* 難易度タブ */}
          <div className="share-card__diff-tabs">
            {DIFF_TABS.map((tab) => {
              const tabAch = achievementsByDifficulty?.[tab.key];
              const isActive = diffTab === tab.key;
              return (
                <button
                  key={tab.key}
                  className={`share-card__diff-tab ${isActive ? 'share-card__diff-tab--active' : ''}`}
                  style={{
                    borderBottomColor: isActive ? tab.color : 'transparent',
                    color: isActive ? tab.color : undefined,
                  }}
                  onClick={() => setDiffTab(tab.key)}
                >
                  {tab.label}
                  {tabAch?.achieved && ' ✓'}
                </button>
              );
            })}
          </div>
          <div className={`share-card__body ${miniMapSvg ? 'share-card__body--with-map' : ''}`}>
            <div className="share-card__body-left">
              <p className="share-card__description">{definition.description}</p>
              <div className="share-card__stats">
                <div className="share-card__stat">
                  <span className="share-card__stat-label">正答率</span>
                  <span className="share-card__stat-value">{Math.round(bestAccuracy * 100)}%</span>
                </div>
                <div className="share-card__stat">
                  <span className="share-card__stat-label">挑戦回数</span>
                  <span className="share-card__stat-value">{attempts}回</span>
                </div>
                {achieved && achievedAt && (
                  <div className="share-card__stat">
                    <span className="share-card__stat-label">達成日</span>
                    <span className="share-card__stat-value">{formatDate(achievedAt)}</span>
                  </div>
                )}
              </div>
              {achieved && <div className="share-card__achieved-badge">ACHIEVED</div>}
            </div>
            {miniMapSvg && (
              <div
                className="share-card__mini-map"
                dangerouslySetInnerHTML={{ __html: miniMapSvg }}
              />
            )}
          </div>
          <div className="share-card__footer">Generated by Tokyo Master</div>
        </div>

        {/* Action buttons */}
        <div className="share-modal__actions">
          <button
            className="share-modal__btn share-modal__btn--download"
            onClick={handleDownload}
            disabled={generating}
          >
            {generating ? '生成中...' : '画像をダウンロード'}
          </button>
          <button className="share-modal__btn share-modal__btn--x" onClick={handleShareX}>
            Xでシェア
          </button>
          <button className="share-modal__btn share-modal__btn--line" onClick={handleShareLINE}>
            LINEでシェア
          </button>
          <button className="share-modal__btn share-modal__btn--close" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
