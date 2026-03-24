import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  CircleMarker,
  Marker,
  Tooltip,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { FeatureCollection } from 'geojson';
import type { QuizQuestion, QuizConfig, QuizChoice, QuizResult, QuizAnswer } from '@/types';
import {
  generateLineQuiz,
  generateWardQuiz,
  generateRiverQuiz,
  generateGenreQuiz,
  getLineInfo,
  getWardCenter,
  getGenreInfo,
} from '@/utils/quizDataLoader';
import { generateChoicesForQuestions } from '@/utils/distractorGenerator';
import { loadRailLines, loadRivers, loadRoads, loadWards } from '@/utils/dataLoader';
import ChoiceButton from './ChoiceButton';

interface Props {
  config: QuizConfig;
  onComplete: (result: QuizResult) => void;
}

type ChoiceState = 'default' | 'correct' | 'wrong' | 'revealed';

/** 地図を指定座標にパンするヘルパー */
function MapPanTo({ lat, lng, zoom }: { lat: number; lng: number; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], zoom ?? map.getZoom(), { animate: true });
  }, [lat, lng, zoom, map]);
  return null;
}

/** GeoJSONの中心にフィットするヘルパー */
function MapFitGeoJSON({ data }: { data: FeatureCollection }) {
  const map = useMap();
  useEffect(() => {
    const layer = L.geoJSON(data);
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: true });
    }
  }, [data, map]);
  return null;
}

export default function MultipleChoiceSession({ config, onComplete }: Props) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [choiceStates, setChoiceStates] = useState<Record<string, ChoiceState>>({});
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);

  // Map state
  const [mapCenter, setMapCenter] = useState<[number, number]>([35.6762, 139.6503]);
  const [mapZoom, setMapZoom] = useState(12);
  const [lineColor, setLineColor] = useState('#6b7280');
  const [lineName, setLineName] = useState('');
  const [lineGeo, setLineGeo] = useState<FeatureCollection | null>(null);
  const [lineIds, setLineIds] = useState<string[]>([]);
  const [lineAbbr, setLineAbbr] = useState('');
  const [wardsGeo, setWardsGeo] = useState<FeatureCollection | null>(null);
  const [riversGeo, setRiversGeo] = useState<FeatureCollection | null>(null);
  const [roadsGeo, setRoadsGeo] = useState<FeatureCollection | null>(null);
  const [quizTitle, setQuizTitle] = useState('');

  // Load questions
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      let qs: QuizQuestion[] = [];

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
        const railGeo = await loadRailLines();
        if (!cancelled) setLineGeo(railGeo);

        qs = await generateChoicesForQuestions(qs, { excludeLineKey: config.scopeId });
      } else if (config.scopeType === 'ward') {
        qs = await generateWardQuiz(config.scopeId);
        const center = await getWardCenter(config.scopeId);
        if (center && !cancelled) {
          setMapCenter([center.lat, center.lng]);
          setMapZoom(13);
          setQuizTitle('区内の地理');
        }
        const [riverGeo, roadGeo] = await Promise.all([loadRivers(), loadRoads()]);
        if (!cancelled) {
          setRiversGeo(riverGeo);
          setRoadsGeo(roadGeo);
        }
        qs = await generateChoicesForQuestions(qs);
      } else if (config.scopeType === 'theme') {
        if (config.scopeId === 'rivers') {
          qs = generateRiverQuiz();
          if (!cancelled) {
            setMapCenter([35.6762, 139.6503]);
            setMapZoom(11);
            setQuizTitle('河川クイズ');
          }
          const riverGeo = await loadRivers();
          if (!cancelled) setRiversGeo(riverGeo);
        } else {
          qs = generateGenreQuiz(config.scopeId);
          const info = getGenreInfo(config.scopeId);
          if (info && !cancelled) {
            setMapCenter([35.6762, 139.6503]);
            setMapZoom(11);
            setQuizTitle(`${info.icon} ${info.label}クイズ`);
          }
        }
        qs = await generateChoicesForQuestions(qs);
      }

      if (!cancelled) {
        // 簡易モード: ランダム10問に絞る
        if (config.quickMode && qs.length > 10) {
          const shuffled = [...qs].sort(() => Math.random() - 0.5);
          qs = shuffled.slice(0, 10);
        }
        setQuestions(qs);
        setAnswers([]);
        setCurrentIndex(0);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [config]);

  const currentQuestion = questions[currentIndex] ?? null;
  const progress = questions.length > 0 ? (currentIndex / questions.length) * 100 : 0;
  const isFinished = currentIndex >= questions.length && questions.length > 0;

  /** Handle choice selection */
  const handleChoiceClick = useCallback(
    (choice: QuizChoice) => {
      if (locked || !currentQuestion) return;
      setLocked(true);

      const isCorrect = choice.isCorrect;
      const correctChoice = currentQuestion.choices?.find((c) => c.isCorrect);

      // Set choice states
      const newStates: Record<string, ChoiceState> = {};
      if (isCorrect) {
        newStates[choice.id] = 'correct';
      } else {
        newStates[choice.id] = 'wrong';
        if (correctChoice) {
          newStates[correctChoice.id] = 'revealed';
        }
      }
      setChoiceStates(newStates);

      // Record answer
      const answer: QuizAnswer = {
        questionId: currentQuestion.id,
        userAnswer: choice.label,
        correctAnswer: currentQuestion.targetName.kanji,
        isCorrect,
        selectedChoiceId: choice.id,
      };
      setAnswers((prev) => [...prev, answer]);

      // Advance after delay
      const delay = isCorrect ? 800 : 1500;
      setTimeout(() => {
        setChoiceStates({});
        setLocked(false);
        setCurrentIndex((prev) => prev + 1);
      }, delay);
    },
    [locked, currentQuestion],
  );

  /** Submit results when finished */
  useEffect(() => {
    if (!isFinished) return;

    const correctCount = answers.filter((a) => a.isCorrect).length;
    const result: QuizResult = {
      quizConfigId: `${config.scopeType}-${config.scopeId}`,
      scopeType: config.scopeType,
      scopeId: config.scopeId,
      difficulty: config.difficulty,
      totalQuestions: questions.length,
      correctAnswers: correctCount,
      accuracy: questions.length > 0 ? correctCount / questions.length : 0,
      completedAt: new Date().toISOString(),
      answers,
    };
    onComplete(result);
  }, [isFinished, answers, questions, config, onComplete]);

  // GeoJSON line filter
  const filteredLineGeo = useMemo(() => {
    if (!lineGeo || lineIds.length === 0) return null;
    const idSet = new Set(lineIds);
    return {
      type: 'FeatureCollection' as const,
      features: lineGeo.features.filter((f) => f.properties?.id && idSet.has(f.properties.id)),
    };
  }, [lineGeo, lineIds]);

  // Station marker icon
  const stationIcon = useMemo(
    () =>
      L.divIcon({
        className: 'quiz-station-icon',
        html: `<svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="#fff" stroke="${lineColor}" stroke-width="2"/></svg>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      }),
    [lineColor],
  );

  if (loading) {
    return <div className="mc-session__loading">読み込み中...</div>;
  }

  if (questions.length === 0) {
    return <div className="mc-session__empty">問題がありません</div>;
  }

  if (isFinished) {
    return <div className="mc-session__loading">結果を表示中...</div>;
  }

  return (
    <div className="mc-session">
      {/* Map area */}
      <div className="mc-session__map-area">
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          className="mc-session__map"
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png" />

          {wardsGeo && (
            <GeoJSON
              data={wardsGeo}
              style={{
                color: '#94a3b8',
                weight: 1,
                fillColor: 'transparent',
                fillOpacity: 0,
              }}
            />
          )}

          {filteredLineGeo && (
            <GeoJSON data={filteredLineGeo} style={{ color: lineColor, weight: 3, opacity: 0.8 }} />
          )}

          {/* Station markers: 出題中 + 回答済みのみ表示 */}
          {questions.map((q, idx) => {
            if (q.lat == null || q.lng == null) return null;
            const isAnswered = idx < answers.length;
            const isCurrent = idx === currentIndex;
            if (!isAnswered && !isCurrent) return null;
            return (
              <Marker key={q.id} position={[q.lat, q.lng]} icon={stationIcon}>
                <Tooltip direction="top" offset={[0, -8]} className="quiz-station-number" permanent>
                  {idx + 1}
                </Tooltip>
              </Marker>
            );
          })}

          {/* 川GeoJSON（テーマ/区クイズ用）: 全体薄く表示 */}
          {riversGeo && (
            <GeoJSON
              key={`mc-rivers-${currentIndex}`}
              data={riversGeo}
              style={() => ({
                color: '#38bdf8',
                weight: currentQuestion?.category === 'rivers' ? 2 : 2,
                opacity: currentQuestion?.category === 'rivers' ? 0.15 : 0.15,
                lineCap: 'round' as const,
              })}
              interactive={false}
            />
          )}

          {/* フォーカス中の川をハイライト */}
          {currentQuestion?.category === 'rivers' &&
            riversGeo &&
            (() => {
              const fullName = currentQuestion.targetName.kanji + (currentQuestion.suffix ?? '');
              const filtered = riversGeo.features.filter((f) => f.properties?.name === fullName);
              if (filtered.length === 0) return null;
              const data = { ...riversGeo, features: filtered } as FeatureCollection;
              return (
                <>
                  <GeoJSON
                    key={`mc-river-hl-${currentIndex}`}
                    data={data}
                    style={() => ({
                      color: '#38bdf8',
                      weight: 5,
                      opacity: 0.9,
                      lineCap: 'round' as const,
                    })}
                    interactive={false}
                  />
                  <MapFitGeoJSON data={data} />
                </>
              );
            })()}

          {/* 道路GeoJSON: 全体薄く */}
          {roadsGeo && (
            <GeoJSON
              key={`mc-roads-${currentIndex}`}
              data={roadsGeo}
              style={() => ({
                color: '#fb923c',
                weight: 2,
                opacity: 0.15,
                lineCap: 'round' as const,
              })}
              interactive={false}
            />
          )}

          {/* フォーカス中の道路をハイライト */}
          {currentQuestion?.category === 'roads' &&
            roadsGeo &&
            (() => {
              const fullName = currentQuestion.targetName.kanji + (currentQuestion.suffix ?? '');
              const filtered = roadsGeo.features.filter((f) => f.properties?.name === fullName);
              if (filtered.length === 0) return null;
              const data = { ...roadsGeo, features: filtered } as FeatureCollection;
              return (
                <>
                  <GeoJSON
                    key={`mc-road-hl-${currentIndex}`}
                    data={data}
                    style={() => ({
                      color: '#fb923c',
                      weight: 5,
                      opacity: 0.9,
                      lineCap: 'round' as const,
                    })}
                    interactive={false}
                  />
                  <MapFitGeoJSON data={data} />
                </>
              );
            })()}

          {/* Highlight current question */}
          {currentQuestion?.lat != null && currentQuestion?.lng != null && (
            <>
              <CircleMarker
                center={[currentQuestion.lat, currentQuestion.lng]}
                radius={16}
                pathOptions={{
                  color: '#f59e0b',
                  weight: 3,
                  fillColor: '#fbbf24',
                  fillOpacity: 0.3,
                }}
              />
              {/* 複数キャンパス: 点線囲み */}
              {currentQuestion.extraLocations?.map((loc, j) => (
                <CircleMarker
                  key={`mc-extra-${j}`}
                  center={[loc.lat, loc.lng]}
                  radius={16}
                  pathOptions={{
                    color: '#f97316',
                    fillColor: 'transparent',
                    weight: 3,
                    dashArray: '4,4',
                  }}
                />
              ))}
              <MapPanTo lat={currentQuestion.lat} lng={currentQuestion.lng} zoom={15} />
            </>
          )}

          {/* Show answered stations */}
          {answers.map((a, idx) => {
            const q = questions[idx];
            if (!q?.lat || !q?.lng) return null;
            return (
              <CircleMarker
                key={`answered-${q.id}`}
                center={[q.lat, q.lng]}
                radius={6}
                pathOptions={{
                  color: a.isCorrect ? '#22c55e' : '#ef4444',
                  weight: 2,
                  fillColor: a.isCorrect ? '#22c55e' : '#ef4444',
                  fillOpacity: 0.4,
                }}
              />
            );
          })}
        </MapContainer>
      </div>

      {/* Question area */}
      <div className="mc-session__question-area">
        {/* Progress */}
        <div className="mc-session__header">
          <span className="mc-session__title">{lineName || quizTitle}</span>
          <span className="mc-session__count">
            {currentIndex + 1} / {questions.length}
          </span>
        </div>

        <div className="mc-session__progress">
          <div className="mc-session__progress-bar" style={{ width: `${progress}%` }} />
        </div>

        {/* Question prompt */}
        <div className="mc-session__prompt">
          <span className="mc-session__prompt-num">
            {currentQuestion.category === 'stations' && `${currentIndex + 1}番目の駅`}
            {currentQuestion.category === 'rivers' && `${currentIndex + 1}番目の川`}
            {currentQuestion.category === 'roads' && `${currentIndex + 1}番目の道路`}
            {currentQuestion.category === 'universities' && `${currentIndex + 1}番目の大学`}
            {currentQuestion.category === 'high_schools' && `${currentIndex + 1}番目の高校`}
            {currentQuestion.category === 'landmarks' && `${currentIndex + 1}番`}
            {currentQuestion.category === 'jiro' && `${currentIndex + 1}番目の店舗`}
            {currentQuestion.category === 'museums' && `${currentIndex + 1}番`}
            {currentQuestion.category === 'parks' && `${currentIndex + 1}番`}
            {currentQuestion.category === 'stadiums' && `${currentIndex + 1}番`}
          </span>
          {lineAbbr && (
            <span className="mc-session__prompt-line" style={{ color: lineColor }}>
              {lineAbbr}
            </span>
          )}
        </div>

        {/* Choice buttons */}
        <div className="mc-session__choices">
          {currentQuestion.choices?.map((choice) => (
            <ChoiceButton
              key={choice.id}
              choice={choice}
              state={choiceStates[choice.id] ?? 'default'}
              suffix={currentQuestion.suffix}
              disabled={locked}
              onClick={handleChoiceClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
