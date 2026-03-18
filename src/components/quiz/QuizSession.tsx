import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  CircleMarker,
  Marker,
  Tooltip,
  Popup,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { FeatureCollection } from 'geojson';
import type { QuizQuestion, QuizConfig, QuizAnswer, QuizResult } from '@/types';
import { matchesName, matchesNameString } from '@/utils/nameMatch';
import {
  generateLineQuiz,
  generateWardQuiz,
  generateRiverQuiz,
  generateGenreQuiz,
  getLineInfo,
  getWardCenter,
  getGenreInfo,
} from '@/utils/quizDataLoader';
import { loadRailLines, loadRivers, loadWards } from '@/utils/dataLoader';
import riversData from '@/data/rivers.json';

interface Props {
  config: QuizConfig;
  onComplete: (result: QuizResult) => void;
}

export default function QuizSession({ config, onComplete }: Props) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mapCenter, setMapCenter] = useState<[number, number]>([35.6762, 139.6503]);
  const [mapZoom, setMapZoom] = useState(12);
  const [lineColor, setLineColor] = useState<string>('#6b7280');
  const [lineName, setLineName] = useState<string>('');
  const [lineGeo, setLineGeo] = useState<FeatureCollection | null>(null);
  const [lineIds, setLineIds] = useState<string[]>([]);
  const [lineAbbr, setLineAbbr] = useState<string>('');
  const [riversGeo, setRiversGeo] = useState<FeatureCollection | null>(null);
  const [wardsGeo, setWardsGeo] = useState<FeatureCollection | null>(null);
  const [genreIcon, setGenreIcon] = useState<string>('');
  const [genreLabel, setGenreLabel] = useState<string>('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      let qs: QuizQuestion[] = [];

      // 区境界は全クイズで表示
      loadWards().then((d) => {
        if (!cancelled) setWardsGeo(d);
      });

      if (config.scopeType === 'line') {
        qs = await generateLineQuiz(config.scopeId);
        const info = await getLineInfo(config.scopeId);
        if (info && !cancelled) {
          setLineColor(info.color);
          setLineName(info.name);
          setLineIds(info.lineIds);
          setLineAbbr(info.abbr);
          if (info.stations.length > 0) {
            const midIdx = Math.floor(info.stations.length / 2);
            const mid = info.stations[midIdx];
            setMapCenter([mid.lat, mid.lng]);
            setMapZoom(12);
          }
        }
        // GeoJSON路線パスを読み込み
        const railGeo = await loadRailLines();
        if (!cancelled) setLineGeo(railGeo);
      } else if (config.scopeType === 'ward') {
        qs = await generateWardQuiz(config.scopeId);
        const center = await getWardCenter(config.scopeId);
        if (center && !cancelled) {
          setMapCenter([center.lat, center.lng]);
          setMapZoom(13);
        }
      } else if (config.scopeType === 'theme') {
        if (config.scopeId === 'rivers') {
          // 河川テーマ（従来の動作）
          qs = generateRiverQuiz();
          setMapCenter([35.6762, 139.6503]);
          setMapZoom(11);
          const riverGeoData = await loadRivers();
          if (!cancelled) setRiversGeo(riverGeoData);
        } else {
          // ジャンルPOIテーマ
          qs = generateGenreQuiz(config.scopeId);
          const info = getGenreInfo(config.scopeId);
          if (info && !cancelled) {
            setGenreIcon(info.icon);
            setGenreLabel(info.label);
          }
          // POI の中心座標を計算して地図の中心を設定
          if (qs.length > 0) {
            const lats = qs.filter((q) => q.lat != null).map((q) => q.lat!);
            const lngs = qs.filter((q) => q.lng != null).map((q) => q.lng!);
            if (lats.length > 0 && lngs.length > 0) {
              const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
              const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
              if (!cancelled) {
                setMapCenter([centerLat, centerLng]);
                setMapZoom(11);
              }
            }
          }
        }
      }

      if (!cancelled) {
        setQuestions(qs);
        setAnswers(new Array(qs.length).fill(''));
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [config]);

  const handleInputChange = useCallback((index: number, value: string) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (!e.shiftKey && index < questions.length - 1) {
          e.preventDefault();
          inputRefs.current[index + 1]?.focus();
        }
      }
    },
    [questions.length],
  );

  const handleSubmit = () => {
    setSubmitted(true);

    const quizAnswers: QuizAnswer[] = questions.map((q, i) => {
      const userAnswer = answers[i] ?? '';
      const correctAnswer = q.targetName.kanji;
      const hasVariants = q.targetName.hiragana !== '' || q.targetName.romaji !== '';
      const isCorrect = hasVariants
        ? matchesName(userAnswer, q.targetName)
        : matchesNameString(userAnswer, correctAnswer);

      return { questionId: q.id, userAnswer, correctAnswer, isCorrect };
    });

    const correctCount = quizAnswers.filter((a) => a.isCorrect).length;

    const result: QuizResult = {
      quizConfigId: `${config.scopeType}-${config.scopeId}`,
      scopeType: config.scopeType,
      scopeId: config.scopeId,
      totalQuestions: questions.length,
      correctAnswers: correctCount,
      accuracy: questions.length > 0 ? correctCount / questions.length : 0,
      completedAt: new Date().toISOString(),
      answers: quizAnswers,
    };

    onComplete(result);
  };

  // 路線GeoJSONをフィルタ（この路線のlineIdsだけ）
  const filteredLineGeo = useMemo(() => {
    if (!lineGeo || lineIds.length === 0) return null;
    const idSet = new Set(lineIds);
    return {
      ...lineGeo,
      features: lineGeo.features.filter((f) => idSet.has(f.properties?.id)),
    } as FeatureCollection;
  }, [lineGeo, lineIds]);

  // 河川GeoJSONの中心座標を計算（テーマクイズ用）
  const riverCenters = useMemo(() => {
    if (!riversGeo || config.scopeType !== 'theme') return [];
    const rivers = riversData as { id: string; name: { kanji: string } }[];
    return rivers.map((river) => {
      // GeoJSONから該当河川のfeatureを検索
      const features = riversGeo.features.filter((f) => f.properties?.name === river.name.kanji);
      if (features.length === 0) return null;
      // 全座標を集めて中間点を算出
      const allCoords: number[][] = [];
      for (const feat of features) {
        const geom = feat.geometry;
        if (geom.type === 'LineString') {
          allCoords.push(...(geom as GeoJSON.LineString).coordinates);
        } else if (geom.type === 'MultiLineString') {
          for (const line of (geom as GeoJSON.MultiLineString).coordinates) {
            allCoords.push(...line);
          }
        }
      }
      if (allCoords.length === 0) return null;
      const midIdx = Math.floor(allCoords.length / 2);
      const midCoord = allCoords[midIdx];
      return { name: river.name.kanji, lat: midCoord[1], lng: midCoord[0] };
    });
  }, [riversGeo, config.scopeType]);

  if (loading) {
    return (
      <div className="quiz-session__loading">
        <p>読み込み中...</p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="quiz-session__empty">
        <p>問題が見つかりませんでした</p>
      </div>
    );
  }

  const answeredCount = answers.filter((a) => a.trim() !== '').length;
  const progress = answeredCount / questions.length;
  const stationMarkers = questions.filter((q) => q.lat && q.lng);

  /** 駅番号ラベルを生成: 路線クイズはJY01形式、それ以外は1,2,3 */
  const getLabel = (index: number): string => {
    if (config.scopeType === 'line' && lineAbbr) {
      return `${lineAbbr}${String(index + 1).padStart(2, '0')}`;
    }
    return `${index + 1}`;
  };

  return (
    <div className="quiz-session">
      <div className="quiz-session__left">
        <div className="quiz-session__header">
          <h2 className="quiz-session__title">
            {config.scopeType === 'line' && lineName}
            {config.scopeType === 'ward' && '区内の地理'}
            {config.scopeType === 'theme' &&
              (config.scopeId === 'rivers' ? '河川クイズ' : `${genreIcon} ${genreLabel}クイズ`)}
          </h2>
          <span className="quiz-session__count">
            {answeredCount}/{questions.length}
          </span>
        </div>

        <div className="quiz-session__progress">
          <div className="quiz-session__progress-bar" style={{ width: `${progress * 100}%` }} />
        </div>

        <div className="quiz-session__questions">
          {questions.map((q, i) => (
            <div key={q.id} className="quiz-session__question">
              <span className="quiz-session__question-num">{getLabel(i)}</span>
              <input
                ref={(el) => {
                  inputRefs.current[i] = el;
                }}
                className={`quiz-session__input ${
                  submitted
                    ? answers[i] &&
                      (q.targetName.hiragana !== '' || q.targetName.romaji !== ''
                        ? matchesName(answers[i], q.targetName)
                        : matchesNameString(answers[i], q.targetName.kanji))
                      ? 'quiz-session__input--correct'
                      : 'quiz-session__input--incorrect'
                    : ''
                }`}
                type="text"
                value={answers[i] ?? ''}
                onChange={(e) => handleInputChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, i)}
                placeholder={config.showHints && q.hint ? q.hint : getLabel(i)}
                disabled={submitted}
                autoComplete="off"
              />
              {submitted && (
                <span className="quiz-session__correct-answer">{q.targetName.kanji}</span>
              )}
            </div>
          ))}
        </div>

        {!submitted && (
          <button className="quiz-session__submit-btn" onClick={handleSubmit}>
            回答を提出
          </button>
        )}
      </div>

      <div className="quiz-session__right">
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          scrollWheelZoom={true}
          wheelDebounceTime={80}
          wheelPxPerZoomLevel={200}
          zoomSnap={0.5}
          zoomDelta={0.5}
          className="quiz-session__map"
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
          />

          {/* 区境界（ヒント） */}
          {wardsGeo && (
            <GeoJSON
              key="quiz-wards"
              data={wardsGeo}
              style={{
                color: '#94a3b8',
                weight: 1,
                fillColor: 'transparent',
                fillOpacity: 0,
              }}
              interactive={false}
            />
          )}

          {/* 路線パス: GeoJSON（地図記号風: 灰色+白交互） */}
          {filteredLineGeo && (
            <>
              <GeoJSON
                key={`quiz-rail-base-${config.scopeId}`}
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
                key={`quiz-rail-dash-${config.scopeId}`}
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

          {/* 河川GeoJSON（河川テーマクイズ用） */}
          {riversGeo && config.scopeType === 'theme' && config.scopeId === 'rivers' && (
            <GeoJSON
              key={`quiz-rivers-${config.scopeId}`}
              data={riversGeo}
              style={() => ({
                color: '#38bdf8',
                weight: 3,
                opacity: 0.8,
                lineCap: 'round',
              })}
              interactive={false}
            />
          )}

          {/* 河川番号マーカー（河川テーマクイズ用） */}
          {config.scopeType === 'theme' &&
            config.scopeId === 'rivers' &&
            !submitted &&
            riverCenters.map((rc, i) =>
              rc ? (
                <Marker
                  key={`river-num-${i}`}
                  position={[rc.lat, rc.lng]}
                  icon={L.divIcon({
                    className: 'quiz-number-icon',
                    html: `<span>${i + 1}</span>`,
                    iconSize: [22, 22],
                    iconAnchor: [11, 11],
                  })}
                  interactive={false}
                />
              ) : null,
            )}

          {/* 河川番号マーカー（提出後は名前表示） */}
          {config.scopeType === 'theme' &&
            config.scopeId === 'rivers' &&
            submitted &&
            riverCenters.map((rc, i) =>
              rc ? (
                <Marker
                  key={`river-name-${i}`}
                  position={[rc.lat, rc.lng]}
                  icon={L.divIcon({
                    className: 'quiz-number-icon',
                    html: `<span>${rc.name}</span>`,
                    iconSize: [60, 22],
                    iconAnchor: [30, 11],
                  })}
                  interactive={false}
                />
              ) : null,
            )}

          {/* ジャンルPOIマーカー（ジャンルテーマクイズ用） */}
          {config.scopeType === 'theme' &&
            config.scopeId !== 'rivers' &&
            stationMarkers.map((q, i) => (
              <Marker
                key={`genre-poi-${q.id}`}
                position={[q.lat!, q.lng!]}
                icon={L.divIcon({
                  className: 'quiz-number-icon',
                  html: submitted ? `<span>${q.targetName.kanji}</span>` : `<span>${i + 1}</span>`,
                  iconSize: [submitted ? 80 : 22, 22],
                  iconAnchor: [submitted ? 40 : 11, 11],
                })}
                interactive={false}
              />
            ))}

          {/* 駅マーカー + 番号ラベル（路線・区クイズ用。ジャンルPOIクイズでは専用マーカーを使用） */}
          {!(config.scopeType === 'theme' && config.scopeId !== 'rivers') &&
            stationMarkers.map((q, i) => (
              <CircleMarker
                key={q.id}
                center={[q.lat!, q.lng!]}
                radius={5}
                pathOptions={{
                  color: lineColor,
                  fillColor: '#fff',
                  fillOpacity: 1,
                  weight: 2,
                }}
              >
                <Tooltip
                  permanent
                  direction="right"
                  offset={[8, 0]}
                  className="quiz-station-number"
                >
                  {submitted ? q.targetName.kanji : getLabel(i)}
                </Tooltip>
                {submitted && (
                  <Popup>
                    <strong>{q.targetName.kanji}</strong>
                  </Popup>
                )}
              </CircleMarker>
            ))}

          {/* 番号マーカー（四角ボックス。ジャンルPOIクイズでは専用マーカーを使用） */}
          {!(config.scopeType === 'theme' && config.scopeId !== 'rivers') &&
            !submitted &&
            stationMarkers.map((q, i) => (
              <Marker
                key={`num-${q.id}`}
                position={[q.lat!, q.lng!]}
                icon={L.divIcon({
                  className: 'quiz-number-icon',
                  html: `<span>${getLabel(i)}</span>`,
                  iconSize: [config.scopeType === 'line' && lineAbbr ? 38 : 22, 22],
                  iconAnchor: [config.scopeType === 'line' && lineAbbr ? 19 : 11, 28],
                })}
                interactive={false}
              />
            ))}
        </MapContainer>
      </div>
    </div>
  );
}
