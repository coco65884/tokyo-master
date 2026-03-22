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
import { generateLineQuiz, getLineInfo } from '@/utils/quizDataLoader';
import { generateChoicesForQuestions } from '@/utils/distractorGenerator';
import { loadRailLines, loadWards } from '@/utils/dataLoader';
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

        // Generate choices for kantan mode
        qs = await generateChoicesForQuestions(qs, { excludeLineKey: config.scopeId });
      }

      if (!cancelled) {
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

          {/* Station markers for all questions */}
          {questions.map((q, idx) =>
            q.lat != null && q.lng != null ? (
              <Marker key={q.id} position={[q.lat, q.lng]} icon={stationIcon}>
                <Tooltip direction="top" offset={[0, -8]} className="quiz-station-number" permanent>
                  {idx + 1}
                </Tooltip>
              </Marker>
            ) : null,
          )}

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
              <MapPanTo lat={currentQuestion.lat} lng={currentQuestion.lng} />
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
          <span className="mc-session__title">{lineName}</span>
          <span className="mc-session__count">
            {currentIndex + 1} / {questions.length}
          </span>
        </div>

        <div className="mc-session__progress">
          <div className="mc-session__progress-bar" style={{ width: `${progress}%` }} />
        </div>

        {/* Question prompt */}
        <div className="mc-session__prompt">
          <span className="mc-session__prompt-num">{currentIndex + 1}番目の駅</span>
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
