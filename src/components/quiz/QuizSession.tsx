import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  CircleMarker,
  Marker,
  Tooltip,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { FeatureCollection } from 'geojson';
import type { QuizQuestion, QuizConfig, QuizAnswer, QuizResult, ThemeType } from '@/types';
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
import { getDifficultySettings } from '@/utils/difficultySettings';
import {
  loadRailLines,
  loadRivers,
  loadRoads,
  loadWards,
  loadWardObjects,
  loadLineIndex,
} from '@/utils/dataLoader';
import riversData from '@/data/rivers.json';

interface Props {
  config: QuizConfig;
  onComplete: (result: QuizResult) => void;
}

/** 区クイズのカテゴリ順序とセクションヘッダー */
const WARD_CATEGORY_ORDER: ThemeType[] = [
  'stations',
  'rivers',
  'roads',
  'universities',
  'landmarks',
];
const WARD_CATEGORY_LABELS: Record<string, string> = {
  stations: '駅',
  rivers: '川',
  roads: '道路',
  universities: '大学',
  landmarks: 'ランドマーク',
};

/**
 * 同一グループのハイライト時に地図をフィットさせる子コンポーネント。
 * useMap() は MapContainer の内部でのみ使用可能なため、独立コンポーネントとして定義。
 */
function GroupFitBounds({
  highlightedGroup,
  questions,
}: {
  highlightedGroup: string | null;
  questions: QuizQuestion[];
}) {
  const map = useMap();

  useEffect(() => {
    if (!highlightedGroup) return;

    const points: [number, number][] = [];
    for (const q of questions) {
      if (q.group !== highlightedGroup) continue;
      if (q.lat != null && q.lng != null) {
        points.push([q.lat, q.lng]);
      }
      if (q.extraLocations) {
        for (const loc of q.extraLocations) {
          points.push([loc.lat, loc.lng]);
        }
      }
    }

    if (points.length >= 2) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
    } else if (points.length === 1) {
      map.setView(points[0], 13);
    }
  }, [highlightedGroup, questions, map]);

  return null;
}

/**
 * 路線クイズ初期表示時に全駅が表示されるよう地図をフィットさせる。
 */
function LineFitBounds({ questions }: { questions: Array<{ lat?: number; lng?: number }> }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current || questions.length < 2) return;
    const points = questions
      .filter((q) => q.lat && q.lng)
      .map((q) => [q.lat, q.lng] as L.LatLngTuple);
    if (points.length >= 2) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 13 });
      fitted.current = true;
    }
  }, [questions, map]);

  return null;
}

/**
 * 地図上のクリックでハイライトを解除するコンポーネント
 */
function MapClickHandler({ onMapClick }: { onMapClick: () => void }) {
  useMapEvents({
    click: () => {
      onMapClick();
    },
  });
  return null;
}

/**
 * 入力フォーカス時に対応する地図座標へパンするコンポーネント。
 * useMap() は MapContainer の内部でのみ使用可能なため、独立コンポーネントとして定義。
 */
function MapPanToFocused({
  focusedIndex,
  questions,
}: {
  focusedIndex: number | null;
  questions: QuizQuestion[];
}) {
  const map = useMap();

  useEffect(() => {
    if (focusedIndex == null) return;
    const q = questions[focusedIndex];
    if (q?.lat == null || q?.lng == null) return;

    // For questions with extraLocations, fit bounds around all locations
    if (q.extraLocations && q.extraLocations.length > 0) {
      const points: [number, number][] = [[q.lat, q.lng]];
      for (const loc of q.extraLocations) {
        points.push([loc.lat, loc.lng]);
      }
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14, animate: true });
    } else {
      // モバイル: キーボード表示で画面が上スクロールされるため、
      // 地図コンテナの下部(70%位置)にターゲットを配置すると
      // キーボード表示後に見える領域の中央に来る
      const isMobile = window.innerWidth <= 768;
      const mapH = map.getContainer().clientHeight;
      if (isMobile && mapH > 0) {
        const targetY = mapH * 0.7; // 下部70%の位置
        const centerY = mapH * 0.5;
        const offsetY = targetY - centerY; // 正の値=下にずらす
        const center = map.latLngToContainerPoint([q.lat, q.lng]);
        const shifted = map.containerPointToLatLng(L.point(center.x, center.y - offsetY));
        map.setView(shifted, 14, { animate: true });
      } else {
        map.setView([q.lat, q.lng], 14, { animate: true });
      }
    }
  }, [focusedIndex, questions, map]);

  return null;
}

export default function QuizSession({ config, onComplete }: Props) {
  const diffSettings = useMemo(() => getDifficultySettings(config.difficulty), [config.difficulty]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerEndRef = useRef<number>(0);
  const [mapCenter, setMapCenter] = useState<[number, number]>([35.6762, 139.6503]);
  const [mapZoom, setMapZoom] = useState(12);
  const [lineColor, setLineColor] = useState<string>('#6b7280');
  const [lineName, setLineName] = useState<string>('');
  const [lineGeo, setLineGeo] = useState<FeatureCollection | null>(null);
  const [lineIds, setLineIds] = useState<string[]>([]);
  const [lineAbbr, setLineAbbr] = useState<string>('');
  const [riversGeo, setRiversGeo] = useState<FeatureCollection | null>(null);
  const [roadsGeo, setRoadsGeo] = useState<FeatureCollection | null>(null);
  const [wardsGeo, setWardsGeo] = useState<FeatureCollection | null>(null);
  const [genreIcon, setGenreIcon] = useState<string>('');
  const [genreLabel, setGenreLabel] = useState<string>('');
  const [highlightedGroup, setHighlightedGroup] = useState<string | null>(null);
  const [focusedQuestionIndex, setFocusedQuestionIndex] = useState<number | null>(null);
  // Ward quiz: line IDs for all rail lines passing through the ward
  const [wardRailLineIds, setWardRailLineIds] = useState<string[]>([]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  /** 頭文字ヒントを生成 */
  const getPlaceholder = useCallback(
    (q: QuizQuestion, fallback: string) => {
      if (diffSettings.showFirstChar && q.targetName.kanji) {
        const kanji = q.targetName.kanji;
        return kanji[0] + '○'.repeat(kanji.length - 1);
      }
      if (config.showHints && q.hint) {
        return q.hint;
      }
      return fallback;
    },
    [diffSettings.showFirstChar, config.showHints],
  );

  /** Focus handler: set focused index and highlight the question's group */
  const handleInputFocus = useCallback(
    (index: number) => {
      setFocusedQuestionIndex(index);
      // If the focused question has a group (multi-campus), highlight it
      const q = questions[index];
      if (q?.group && q.extraLocations && q.extraLocations.length > 0) {
        setHighlightedGroup(q.group);
      } else {
        setHighlightedGroup(null);
      }
      // 入力欄を一番上にスクロール
      requestAnimationFrame(() => {
        const el = inputRefs.current[index];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    },
    [questions],
  );

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
            // 全駅が見えるよう中心とズームを計算
            const lats = info.stations.map((s) => s.lat);
            const lngs = info.stations.map((s) => s.lng);
            setMapCenter([
              (Math.min(...lats) + Math.max(...lats)) / 2,
              (Math.min(...lngs) + Math.max(...lngs)) / 2,
            ]);
            // 駅の広がりに応じてズームレベルを調整
            const latSpan = Math.max(...lats) - Math.min(...lats);
            const lngSpan = Math.max(...lngs) - Math.min(...lngs);
            const span = Math.max(latSpan, lngSpan);
            if (span > 1.5) setMapZoom(8);
            else if (span > 0.8) setMapZoom(9);
            else if (span > 0.4) setMapZoom(10);
            else if (span > 0.15) setMapZoom(11);
            else setMapZoom(12);
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

        // Load map layers for ward quiz: rail lines, rivers, roads
        const [railGeo, riverGeoData, roadGeoData, wardObjects, lineIndex] = await Promise.all([
          loadRailLines(),
          loadRivers(),
          loadRoads(),
          loadWardObjects(),
          loadLineIndex(),
        ]);
        if (!cancelled) {
          setLineGeo(railGeo);
          setRiversGeo(riverGeoData);
          setRoadsGeo(roadGeoData);

          // Collect all line IDs for rail lines passing through this ward
          const wardObj = wardObjects[config.scopeId];
          if (wardObj) {
            const allLineIds: string[] = [];
            for (const lineKey of wardObj.lineKeys) {
              const line = lineIndex.lines.find((l) => l.key === lineKey);
              if (line) {
                allLineIds.push(...line.lineIds);
              }
            }
            setWardRailLineIds(allLineIds);
          }
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
        // 簡易モード: ランダム10問に絞る
        if (config.quickMode && qs.length > 10) {
          const shuffled = [...qs].sort(() => Math.random() - 0.5);
          qs = shuffled.slice(0, 10);
        }
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

  // 制限時間タイマー（refベースで再レンダリングをトリガー）
  const [timerTick, setTimerTick] = useState(0);
  useEffect(() => {
    if (loading || submitted) return;
    const limit = diffSettings.timeLimitPerQuestion;
    if (limit <= 0) return;

    const totalTime = limit * questions.length;
    timerEndRef.current = Date.now() + totalTime * 1000;

    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((timerEndRef.current - Date.now()) / 1000));
      setTimerTick(remaining);
      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        setSubmitted(true);
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loading, submitted, diffSettings.timeLimitPerQuestion, questions.length]);

  const timeLeft = timerTick;

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

  /** マーカークリック時: 入力フォーカス + グループハイライト */
  const handleMarkerClick = useCallback(
    (index: number) => {
      inputRefs.current[index]?.focus();
      const q = questions[index];
      if (q?.group) {
        setHighlightedGroup((prev) => (prev === q.group ? null : (q.group ?? null)));
      }
    },
    [questions],
  );

  /** 地図クリック時: ハイライト解除 */
  const handleMapClick = useCallback(() => {
    setHighlightedGroup(null);
  }, []);

  const handleSubmit = () => {
    setSubmitted(true);

    const quizAnswers: QuizAnswer[] = questions.map((q, i) => {
      const userAnswer = answers[i] ?? '';
      const correctAnswer = q.targetName.kanji;
      const hasVariants = q.targetName.hiragana !== '' || q.targetName.romaji !== '';
      const isCorrect = hasVariants
        ? matchesName(userAnswer, q.targetName)
        : matchesNameString(userAnswer, correctAnswer);
      // 結果表示用: サフィックス付きの正解名
      const displayAnswer = q.suffix ? correctAnswer + q.suffix : correctAnswer;

      return { questionId: q.id, userAnswer, correctAnswer: displayAnswer, isCorrect };
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
    if (!lineGeo) return null;
    // Line quiz: filter by lineIds
    if (config.scopeType === 'line' && lineIds.length > 0) {
      const idSet = new Set(lineIds);
      return {
        ...lineGeo,
        features: lineGeo.features.filter((f) => idSet.has(f.properties?.id)),
      } as FeatureCollection;
    }
    // Ward quiz: filter by wardRailLineIds
    if (config.scopeType === 'ward' && wardRailLineIds.length > 0) {
      const idSet = new Set(wardRailLineIds);
      return {
        ...lineGeo,
        features: lineGeo.features.filter((f) => idSet.has(f.properties?.id)),
      } as FeatureCollection;
    }
    return null;
  }, [lineGeo, lineIds, wardRailLineIds, config.scopeType]);

  // 区クイズの場合、対象区をハイライトするためにGeoJSONを分離
  const wardHighlightGeo = useMemo(() => {
    if (!wardsGeo || config.scopeType !== 'ward') return null;
    return {
      ...wardsGeo,
      features: wardsGeo.features.filter((f) => f.properties?.id === config.scopeId),
    } as FeatureCollection;
  }, [wardsGeo, config.scopeType, config.scopeId]);

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

  // フォーカス中の川のGeoJSONフィルタ（区クイズ + テーマクイズ河川）
  const focusedRiverGeo = useMemo(() => {
    if (focusedQuestionIndex === null || !riversGeo) return null;
    const q = questions[focusedQuestionIndex];
    if (!q || q.category !== 'rivers') return null;
    // targetName.kanjiはサフィックス除去済み（例: "仙"）、GeoJSONのnameは "仙川"
    const fullName = q.targetName.kanji + (q.suffix ?? '');
    const filtered = riversGeo.features.filter((f) => f.properties?.name === fullName);
    if (filtered.length === 0) return null;
    return { ...riversGeo, features: filtered } as FeatureCollection;
  }, [focusedQuestionIndex, questions, riversGeo]);

  const focusedRoadGeo = useMemo(() => {
    if (focusedQuestionIndex === null || config.scopeType !== 'ward' || !roadsGeo) return null;
    const q = questions[focusedQuestionIndex];
    if (!q || q.category !== 'roads') return null;
    // 道路名: targetName.kanji + suffix（例: "環七" + "通り" → "環七通り"）
    const fullName = q.targetName.kanji + (q.suffix ?? '');
    const filtered = roadsGeo.features.filter((f) => f.properties?.name === fullName);
    if (filtered.length === 0) return null;
    return { ...roadsGeo, features: filtered } as FeatureCollection;
  }, [focusedQuestionIndex, questions, config.scopeType, roadsGeo]);

  // focusedRiverGeo / focusedRoadGeo がnon-nullならハイライト表示される

  // 区クイズ用: カテゴリ別にグループ化された問題
  const wardCategoryGroups = useMemo(() => {
    if (config.scopeType !== 'ward') return null;
    const groups: {
      category: ThemeType;
      label: string;
      questions: { q: QuizQuestion; globalIndex: number }[];
    }[] = [];
    for (const cat of WARD_CATEGORY_ORDER) {
      const catQuestions = questions
        .map((q, i) => ({ q, globalIndex: i }))
        .filter(({ q }) => q.category === cat);
      if (catQuestions.length > 0) {
        groups.push({
          category: cat,
          label: WARD_CATEGORY_LABELS[cat] ?? cat,
          questions: catQuestions,
        });
      }
    }
    return groups;
  }, [questions, config.scopeType]);

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

  /** 問題のindexを取得（stationMarkersのindexからquestionsのindexに変換） */
  const getQuestionIndex = (q: QuizQuestion): number => {
    return questions.indexOf(q);
  };

  /** 区クイズ用: 問題入力行をレンダリング */
  const renderQuestionInput = (q: QuizQuestion, globalIndex: number, localLabel: string) => (
    <div key={q.id} className="quiz-session__question">
      <span className="quiz-session__question-num">{localLabel}</span>
      <input
        ref={(el) => {
          inputRefs.current[globalIndex] = el;
        }}
        className={`quiz-session__input ${
          submitted
            ? answers[globalIndex] &&
              (q.targetName.hiragana !== '' || q.targetName.romaji !== ''
                ? matchesName(answers[globalIndex], q.targetName)
                : matchesNameString(answers[globalIndex], q.targetName.kanji))
              ? 'quiz-session__input--correct'
              : 'quiz-session__input--incorrect'
            : ''
        }`}
        type="text"
        value={answers[globalIndex] ?? ''}
        onChange={(e) => handleInputChange(globalIndex, e.target.value)}
        onKeyDown={(e) => handleKeyDown(e, globalIndex)}
        onFocus={() => handleInputFocus(globalIndex)}
        placeholder={getPlaceholder(q, localLabel)}
        disabled={submitted}
        autoComplete="off"
      />
      {q.suffix && <span className="quiz-session__suffix">{q.suffix}</span>}
      {submitted && (
        <span className="quiz-session__correct-answer">
          {q.targetName.kanji}
          {q.suffix ?? ''}
        </span>
      )}
    </div>
  );

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
          {diffSettings.timeLimitPerQuestion > 0 && !submitted && (
            <span
              className={`quiz-session__timer ${timeLeft <= 10 ? 'quiz-session__timer--urgent' : ''}`}
            >
              ⏱ {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
            </span>
          )}
        </div>

        <div className="quiz-session__progress">
          <div className="quiz-session__progress-bar" style={{ width: `${progress * 100}%` }} />
        </div>

        <div className="quiz-session__questions">
          {/* 区クイズ: カテゴリ別グループ表示 */}
          {config.scopeType === 'ward' && wardCategoryGroups
            ? wardCategoryGroups.map((group) => (
                <div key={group.category} className="quiz-session__category-section">
                  <div className="quiz-session__category-header">{group.label}</div>
                  {group.questions.map(({ q, globalIndex }, localIdx) =>
                    renderQuestionInput(q, globalIndex, `${localIdx + 1}`),
                  )}
                </div>
              ))
            : /* 路線・テーマクイズ: フラット表示 */
              questions.map((q, i) => (
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
                    onFocus={() => handleInputFocus(i)}
                    placeholder={getPlaceholder(q, getLabel(i))}
                    disabled={submitted}
                    autoComplete="off"
                  />
                  {q.suffix && <span className="quiz-session__suffix">{q.suffix}</span>}
                  {submitted && (
                    <span className="quiz-session__correct-answer">
                      {q.targetName.kanji}
                      {q.suffix ?? ''}
                    </span>
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

          {/* 地図クリックでハイライト解除 */}
          <MapClickHandler onMapClick={handleMapClick} />

          {/* グループハイライト時に地図をフィット */}
          <GroupFitBounds highlightedGroup={highlightedGroup} questions={questions} />

          {/* 路線クイズ: 初回表示時に全駅をフィット */}
          {config.scopeType === 'line' && <LineFitBounds questions={questions} />}

          {/* 入力フォーカス時に対応座標へパン */}
          <MapPanToFocused focusedIndex={focusedQuestionIndex} questions={questions} />

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

          {/* 区クイズ: 対象区のハイライト（水色塗り+青枠、地理確認と同等） */}
          {wardHighlightGeo && (
            <GeoJSON
              key={`quiz-ward-highlight-${config.scopeId}`}
              data={wardHighlightGeo}
              style={{
                color: '#4a90d9',
                weight: 2.5,
                fillColor: '#dbeafe',
                fillOpacity: 0.35,
              }}
              interactive={false}
            />
          )}

          {/* 路線パス */}
          {config.scopeType === 'ward' && lineGeo ? (
            <>
              {/* 区クイズ: 全路線を薄く表示（区外も含む） */}
              <GeoJSON
                key={`quiz-rail-bg-base-${config.scopeId}`}
                data={lineGeo}
                style={() => ({
                  color: '#6b7280',
                  weight: 4,
                  opacity: 0.12,
                  lineCap: 'butt',
                  lineJoin: 'miter',
                })}
                interactive={false}
              />
              <GeoJSON
                key={`quiz-rail-bg-dash-${config.scopeId}`}
                data={lineGeo}
                style={() => ({
                  color: '#ffffff',
                  weight: 2,
                  opacity: 0.1,
                  dashArray: '6, 6',
                  lineCap: 'butt',
                  lineJoin: 'miter',
                })}
                interactive={false}
              />
            </>
          ) : filteredLineGeo ? (
            <>
              {/* 路線クイズ: 選択路線のみ濃く */}
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
          ) : null}

          {/* 河川GeoJSON（河川テーマクイズ用）: 全体薄く + フォーカス中の川を太く */}
          {riversGeo && config.scopeType === 'theme' && config.scopeId === 'rivers' && (
            <GeoJSON
              key={`quiz-rivers-${config.scopeId}-${focusedQuestionIndex}`}
              data={riversGeo}
              style={() => ({
                color: '#38bdf8',
                weight: 2,
                opacity: focusedRiverGeo ? 0.15 : 0.8,
                lineCap: 'round',
              })}
              interactive={false}
            />
          )}
          {/* テーマクイズ河川: フォーカス中の川をハイライト */}
          {focusedRiverGeo && config.scopeType === 'theme' && config.scopeId === 'rivers' && (
            <GeoJSON
              key={`theme-river-hl-${focusedQuestionIndex}`}
              data={focusedRiverGeo}
              style={() => ({ color: '#38bdf8', weight: 5, opacity: 0.9, lineCap: 'round' })}
              interactive={false}
            />
          )}

          {/* 河川: 区クイズは全体薄く表示 */}
          {config.scopeType === 'ward' && riversGeo && (
            <GeoJSON
              key={`quiz-ward-rivers-${config.scopeId}`}
              data={riversGeo}
              style={() => ({ color: '#38bdf8', weight: 2, opacity: 0.15, lineCap: 'round' })}
              interactive={false}
            />
          )}

          {/* 道路: 区クイズは全体薄く表示 */}
          {config.scopeType === 'ward' && roadsGeo && (
            <GeoJSON
              key={`quiz-ward-roads-${config.scopeId}`}
              data={roadsGeo}
              style={() => ({ color: '#fb923c', weight: 2, opacity: 0.15, lineCap: 'round' })}
              interactive={false}
            />
          )}

          {/* 区クイズ: フォーカス中の川をハイライト */}
          {focusedRiverGeo && (
            <GeoJSON
              key={`ward-river-hl-${focusedQuestionIndex}`}
              data={focusedRiverGeo}
              style={() => ({ color: '#38bdf8', weight: 4, opacity: 0.9, lineCap: 'round' })}
              interactive={false}
            />
          )}

          {/* 区クイズ: フォーカス中の道路をハイライト */}
          {focusedRoadGeo && (
            <GeoJSON
              key={`ward-road-hl-${focusedQuestionIndex}`}
              data={focusedRoadGeo}
              style={() => ({ color: '#fb923c', weight: 4, opacity: 0.9, lineCap: 'round' })}
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
                  eventHandlers={{ click: () => inputRefs.current[i]?.focus() }}
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

          {/* ジャンルPOIメインマーカー（ジャンルテーマクイズ用） */}
          {config.scopeType === 'theme' &&
            config.scopeId !== 'rivers' &&
            stationMarkers.map((q, i) => {
              const qIdx = getQuestionIndex(q);
              const isHighlighted = highlightedGroup != null && q.group === highlightedGroup;
              return (
                <Marker
                  key={`genre-poi-${q.id}`}
                  position={[q.lat!, q.lng!]}
                  icon={L.divIcon({
                    className: `quiz-number-icon${isHighlighted ? ' quiz-marker-highlight' : ''}`,
                    html: submitted
                      ? `<span>${q.targetName.kanji}${q.suffix ?? ''}</span>`
                      : `<span>${i + 1}</span>`,
                    iconSize: [submitted ? 80 : 22, 22],
                    iconAnchor: [submitted ? 40 : 11, 11],
                  })}
                  eventHandlers={{ click: () => handleMarkerClick(qIdx) }}
                >
                  {submitted && q.poiDisplayName && (
                    <Tooltip
                      permanent
                      direction="bottom"
                      offset={[0, 8]}
                      className="quiz-station-number"
                    >
                      {q.poiDisplayName}
                    </Tooltip>
                  )}
                </Marker>
              );
            })}

          {/* ジャンルPOI追加キャンパスマーカー（extraLocations） */}
          {config.scopeType === 'theme' &&
            config.scopeId !== 'rivers' &&
            stationMarkers.map((q, i) => {
              if (!q.extraLocations) return null;
              const qIdx = getQuestionIndex(q);
              const isHighlighted = highlightedGroup != null && q.group === highlightedGroup;
              return q.extraLocations.map((loc, j) => (
                <Marker
                  key={`genre-extra-${q.id}-${j}`}
                  position={[loc.lat, loc.lng]}
                  icon={L.divIcon({
                    className: `quiz-number-icon${isHighlighted ? ' quiz-marker-highlight' : ''}`,
                    html: submitted
                      ? `<span>${q.targetName.kanji}${q.suffix ?? ''}</span>`
                      : `<span>${i + 1}</span>`,
                    iconSize: [submitted ? 80 : 22, 22],
                    iconAnchor: [submitted ? 40 : 11, 11],
                  })}
                  eventHandlers={{ click: () => handleMarkerClick(qIdx) }}
                >
                  {submitted && loc.name && (
                    <Tooltip
                      permanent
                      direction="bottom"
                      offset={[0, 8]}
                      className="quiz-station-number"
                    >
                      {loc.name}
                    </Tooltip>
                  )}
                </Marker>
              ));
            })}

          {/* 駅マーカー + 番号ラベル（路線・区クイズ用。ジャンルPOIクイズでは専用マーカーを使用） */}
          {!(config.scopeType === 'theme' && config.scopeId !== 'rivers') &&
            stationMarkers.map((q, i) => {
              const qIdx = getQuestionIndex(q);
              return (
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
                  eventHandlers={{ click: () => handleMarkerClick(qIdx) }}
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
              );
            })}

          {/* 番号マーカー（四角ボックス。路線・区クイズ用） */}
          {!(config.scopeType === 'theme' && config.scopeId !== 'rivers') &&
            !submitted &&
            stationMarkers.map((q, i) => {
              const qIdx = getQuestionIndex(q);
              return (
                <Marker
                  key={`num-${q.id}`}
                  position={[q.lat!, q.lng!]}
                  icon={L.divIcon({
                    className: 'quiz-number-icon',
                    html: `<span>${getLabel(i)}</span>`,
                    iconSize: [config.scopeType === 'line' && lineAbbr ? 38 : 22, 22],
                    iconAnchor: [config.scopeType === 'line' && lineAbbr ? 19 : 11, 28],
                  })}
                  eventHandlers={{ click: () => handleMarkerClick(qIdx) }}
                />
              );
            })}

          {/* フォーカス中マーカーのハイライトリング */}
          {focusedQuestionIndex !== null && questions[focusedQuestionIndex]?.lat && (
            <>
              <CircleMarker
                center={[
                  questions[focusedQuestionIndex].lat!,
                  questions[focusedQuestionIndex].lng!,
                ]}
                radius={15}
                pathOptions={{
                  color: '#f97316',
                  fillColor: 'transparent',
                  weight: 3,
                  dashArray: '4,4',
                }}
                className="quiz-focus-ring"
              />
              {/* 複数キャンパス: 全キャンパスに点線リングを表示 */}
              {questions[focusedQuestionIndex].extraLocations?.map((loc, j) => (
                <CircleMarker
                  key={`focus-extra-${j}`}
                  center={[loc.lat, loc.lng]}
                  radius={15}
                  pathOptions={{
                    color: '#f97316',
                    fillColor: 'transparent',
                    weight: 3,
                    dashArray: '4,4',
                  }}
                  className="quiz-focus-ring"
                />
              ))}
            </>
          )}
        </MapContainer>
      </div>
    </div>
  );
}
