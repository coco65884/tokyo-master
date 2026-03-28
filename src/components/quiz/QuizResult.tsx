import { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { FeatureCollection } from 'geojson';
import type { QuizResult as QuizResultType, QuizConfig } from '@/types';
import { useAchievementStore } from '@/stores/achievementStore';
import { getAchievementId } from '@/data/achievements';
import { getLineInfo, getWardCenter } from '@/utils/quizDataLoader';
import { loadRailLines, loadWards } from '@/utils/dataLoader';
import { Link } from 'react-router-dom';
import type { AchievementDefinition } from '@/types';
import { hapticsAchievement } from '@/utils/haptics';
import BannerAd from '@/components/ads/BannerAd';
import type { LineIndexEntry } from '@/types';
import type { WardCenter } from '@/utils/dataLoader';
import ShareCard from '@/components/achievement/ShareCard';

interface Props {
  result: QuizResultType;
  config: QuizConfig | null;
  onRetry: () => void;
  onBackToSelector: () => void;
}

export default function QuizResult({ result, config, onRetry, onBackToSelector }: Props) {
  const updateAchievement = useAchievementStore((s) => s.updateAchievement);
  const hasUpdatedRef = useRef(false);
  const [tab, setTab] = useState<'list' | 'map'>('list');
  const [lineInfo, setLineInfo] = useState<LineIndexEntry | null>(null);
  const [lineGeo, setLineGeo] = useState<FeatureCollection | null>(null);
  const [wardsGeo, setWardsGeo] = useState<FeatureCollection | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(
    result.scopeId.startsWith('blankmap-') || result.scopeType === 'theme'
      ? [35.6762, 139.6503]
      : [35.6762, 139.6503],
  );
  const [mapZoom, setMapZoom] = useState(
    result.scopeId.startsWith('blankmap-') ? 10 : result.scopeType === 'theme' ? 11 : 12,
  );

  const accuracyPercent = Math.round(result.accuracy * 100);

  useEffect(() => {
    if (hasUpdatedRef.current) return;
    hasUpdatedRef.current = true;
    const baseId = getAchievementId(result.scopeType, result.scopeId);
    const achievementId = result.difficulty ? `${baseId}:${result.difficulty}` : baseId;
    updateAchievement(achievementId, result.accuracy);
    if (result.accuracy === 1) {
      hapticsAchievement();
    }
  }, [result, updateAchievement]);

  // 地図データ読み込み
  useEffect(() => {
    loadWards().then(setWardsGeo);

    if (result.scopeType === 'line') {
      getLineInfo(result.scopeId).then((info) => {
        if (info) {
          setLineInfo(info);
          if (info.stations.length > 0) {
            const mid = info.stations[Math.floor(info.stations.length / 2)];
            setMapCenter([mid.lat, mid.lng]);
            setMapZoom(12);
          }
        }
      });
      loadRailLines().then(setLineGeo);
    } else if (result.scopeType === 'ward' && !result.scopeId.startsWith('blankmap-')) {
      getWardCenter(result.scopeId).then((c: WardCenter | undefined) => {
        if (c) {
          setMapCenter([c.lat, c.lng]);
          setMapZoom(13);
        }
      });
    }
  }, [result]);

  const filteredLineGeo = useMemo(() => {
    if (!lineGeo || !lineInfo) return null;
    const idSet = new Set(lineInfo.lineIds);
    return {
      ...lineGeo,
      features: lineGeo.features.filter((f) => idSet.has(f.properties?.id)),
    } as FeatureCollection;
  }, [lineGeo, lineInfo]);

  // 回答を座標付きで構築
  const stationResults = useMemo(() => {
    if (!lineInfo) return [];
    return result.answers.map((a, i) => ({
      ...a,
      lat: lineInfo.stations[i]?.lat,
      lng: lineInfo.stations[i]?.lng,
      label: lineInfo.abbr ? `${lineInfo.abbr}${String(i + 1).padStart(2, '0')}` : `${i + 1}`,
    }));
  }, [result.answers, lineInfo]);

  const getAccuracyClass = () => {
    if (accuracyPercent >= 80) return 'quiz-result__score--great';
    if (accuracyPercent >= 50) return 'quiz-result__score--good';
    return 'quiz-result__score--needs-work';
  };

  const isBlankMap = result.scopeId.startsWith('blankmap-');

  // 白地図クイズ: wardId → 回答のマップ
  const blankMapAnswerMap = useMemo(() => {
    if (!isBlankMap) return new Map();
    const map = new Map<string, (typeof result.answers)[0]>();
    for (const a of result.answers) {
      map.set(a.questionId, a);
    }
    return map;
  }, [isBlankMap, result]);

  const baseAchievementId = getAchievementId(result.scopeType, result.scopeId);
  const diffAchievementId = result.difficulty
    ? `${baseAchievementId}:${result.difficulty}`
    : baseAchievementId;
  const allAchievements = useAchievementStore((s) => s.achievements);
  const userAchievement = allAchievements[diffAchievementId];
  const justAchieved = result.accuracy === 1 && userAchievement?.attempts === 1;

  // アチーブメント達成時のShareCardポップアップ（初回達成時は自動表示）
  const [showShareCard, setShowShareCard] = useState(justAchieved);

  // アチーブメント定義を構築（ShareCard用）
  const achievementDef = useMemo((): AchievementDefinition | null => {
    if (result.accuracy !== 1) return null;
    const title = lineInfo
      ? `${lineInfo.name}マスター`
      : config?.scopeType === 'ward'
        ? `${result.scopeId}マスター`
        : 'マスター';
    return {
      id: baseAchievementId,
      title,
      description: `全問正解`,
      scopeType: result.scopeType,
      scopeId: result.scopeId,
      color: lineInfo?.color ?? '#6366f1',
      icon: lineInfo?.abbr ?? '★',
    };
  }, [result, lineInfo, config, baseAchievementId]);

  return (
    <div className="quiz-result">
      <div className="quiz-result__header-row">
        <h2 className="quiz-result__title">結果</h2>
        <div className={`quiz-result__score-inline ${getAccuracyClass()}`}>
          {accuracyPercent}% ({result.correctAnswers}/{result.totalQuestions})
        </div>
      </div>

      {result.accuracy === 1 && achievementDef && (
        <button
          className="quiz-result__achievement-notice quiz-result__achievement-notice--clickable"
          onClick={() => setShowShareCard(true)}
          type="button"
        >
          🎉 アチーブメント達成！タップしてシェア →
        </button>
      )}

      {/* アチーブメント共有ポップアップ */}
      {showShareCard && achievementDef && (
        <ShareCard
          definition={achievementDef}
          achievementsByDifficulty={{
            kantan: allAchievements[`${baseAchievementId}:kantan`],
            futsuu: allAchievements[`${baseAchievementId}:futsuu`],
            muzukashii: allAchievements[`${baseAchievementId}:muzukashii`],
          }}
          initialDifficulty={(result.difficulty as 'kantan' | 'futsuu' | 'muzukashii') ?? 'futsuu'}
          onClose={() => setShowShareCard(false)}
        />
      )}

      {/* タブ切り替え */}
      <div className="quiz-result__tabs">
        <button
          className={`quiz-result__tab ${tab === 'list' ? 'quiz-result__tab--active' : ''}`}
          onClick={() => setTab('list')}
        >
          回答一覧
        </button>
        <button
          className={`quiz-result__tab ${tab === 'map' ? 'quiz-result__tab--active' : ''}`}
          onClick={() => setTab('map')}
        >
          地図で確認
        </button>
      </div>

      {/* 回答一覧タブ */}
      {tab === 'list' && (
        <div className="quiz-result__answers">
          <div className="quiz-result__answer-list">
            {result.answers.map((answer, idx) => {
              const label =
                config?.scopeType === 'line' && lineInfo?.abbr
                  ? `${lineInfo.abbr}${String(idx + 1).padStart(2, '0')}`
                  : `${idx + 1}`;
              return (
                <div
                  key={answer.questionId}
                  className={`quiz-result__answer ${
                    answer.isCorrect
                      ? 'quiz-result__answer--correct'
                      : 'quiz-result__answer--incorrect'
                  }`}
                >
                  <span className="quiz-result__answer-num">{label}</span>
                  <span className="quiz-result__answer-correct">{answer.correctAnswer}</span>
                  {!answer.isCorrect && answer.userAnswer && (
                    <span className="quiz-result__answer-user">({answer.userAnswer})</span>
                  )}
                  <span className="quiz-result__answer-icon">
                    {answer.isCorrect ? '\u2713' : '\u2717'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 地図タブ */}
      {tab === 'map' && (
        <div className="quiz-result__map-container">
          <div className="quiz-result__map-legend">
            <span className="quiz-result__legend-item quiz-result__legend--correct">● 正解</span>
            <span className="quiz-result__legend-item quiz-result__legend--incorrect">
              ● 不正解
            </span>
          </div>
          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            scrollWheelZoom={true}
            wheelDebounceTime={80}
            wheelPxPerZoomLevel={200}
            zoomSnap={0.5}
            zoomDelta={0.5}
            className="quiz-result__map"
            style={{ width: '100%', height: '400px' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
            />

            {/* 区境界: 白地図クイズの場合は正誤で色分け */}
            {wardsGeo && (
              <GeoJSON
                key={`result-wards-${isBlankMap}`}
                data={wardsGeo}
                style={(feature) => {
                  if (!isBlankMap) {
                    return {
                      color: '#94a3b8',
                      weight: 1,
                      fillColor: 'transparent',
                      fillOpacity: 0,
                    };
                  }
                  const wardId = feature?.properties?.id as string;
                  const answer = blankMapAnswerMap.get(wardId);
                  if (!answer) {
                    return { color: '#94a3b8', weight: 1, fillColor: '#f1f5f9', fillOpacity: 0.3 };
                  }
                  return {
                    color: answer.isCorrect ? '#16a34a' : '#dc2626',
                    weight: 1.5,
                    fillColor: answer.isCorrect ? '#bbf7d0' : '#fecaca',
                    fillOpacity: 0.6,
                  };
                }}
                onEachFeature={
                  isBlankMap
                    ? (feature, layer) => {
                        const wardId = feature?.properties?.id as string;
                        const answer = blankMapAnswerMap.get(wardId);
                        if (answer) {
                          (layer as L.Path).bindTooltip(answer.correctAnswer, {
                            permanent: true,
                            direction: 'center',
                            className: 'blank-map__ward-label',
                          });
                        }
                      }
                    : undefined
                }
              />
            )}

            {/* 路線パス */}
            {filteredLineGeo && (
              <>
                <GeoJSON
                  key="result-rail-base"
                  data={filteredLineGeo}
                  style={() => ({
                    color: '#6b7280',
                    weight: 5,
                    opacity: 0.7,
                    lineCap: 'butt',
                    lineJoin: 'miter',
                  })}
                  interactive={false}
                />
                <GeoJSON
                  key="result-rail-dash"
                  data={filteredLineGeo}
                  style={() => ({
                    color: '#ffffff',
                    weight: 3,
                    opacity: 0.7,
                    dashArray: '6, 6',
                    lineCap: 'butt',
                    lineJoin: 'miter',
                  })}
                  interactive={false}
                />
              </>
            )}

            {/* 駅マーカー（正解=緑、不正解=赤） */}
            {stationResults
              .filter((s) => s.lat && s.lng)
              .map((s) => (
                <CircleMarker
                  key={s.questionId}
                  center={[s.lat!, s.lng!]}
                  radius={6}
                  pathOptions={{
                    color: s.isCorrect ? '#22c55e' : '#ef4444',
                    fillColor: s.isCorrect ? '#22c55e' : '#ef4444',
                    fillOpacity: 0.9,
                    weight: 2,
                  }}
                >
                  <Tooltip
                    permanent
                    direction="top"
                    offset={[0, -8]}
                    className="quiz-station-number"
                  >
                    {s.correctAnswer}
                  </Tooltip>
                </CircleMarker>
              ))}

            {/* 番号マーカー */}
            {stationResults
              .filter((s) => s.lat && s.lng)
              .map((s) => (
                <Marker
                  key={`label-${s.questionId}`}
                  position={[s.lat!, s.lng!]}
                  icon={L.divIcon({
                    className: 'quiz-number-icon',
                    html: `<span style="border-color:${s.isCorrect ? '#22c55e' : '#ef4444'};color:${s.isCorrect ? '#22c55e' : '#ef4444'}">${s.label}</span>`,
                    iconSize: [38, 22],
                    iconAnchor: [19, 28],
                  })}
                  interactive={false}
                />
              ))}
          </MapContainer>
        </div>
      )}

      <div className="quiz-result__actions">
        <button className="quiz-result__retry-btn" onClick={onRetry}>
          もう一度挑戦
        </button>
        <button className="quiz-result__back-btn" onClick={onBackToSelector}>
          クイズ選択に戻る
        </button>
        <Link to="/" className="quiz-result__home-btn">
          ホームへ戻る
        </Link>
      </div>

      <BannerAd />
    </div>
  );
}
