import { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { QuizQuestion, QuizConfig, QuizAnswer, QuizResult } from '@/types';
import { matchesName, matchesNameString } from '@/utils/nameMatch';
import {
  generateLineQuiz,
  generateWardQuiz,
  generateRiverQuiz,
  getLineInfo,
  getWardCenter,
} from '@/utils/quizDataLoader';

interface Props {
  config: QuizConfig;
  onComplete: (result: QuizResult) => void;
}

/** 駅マーカー用のシンプルなアイコン */
const stationIcon = L.divIcon({
  className: 'quiz-station-icon',
  html: '<div style="width:8px;height:8px;border-radius:50%;background:#1a73e8;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

export default function QuizSession({ config, onComplete }: Props) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mapCenter, setMapCenter] = useState<[number, number]>([35.6762, 139.6503]);
  const [mapZoom, setMapZoom] = useState(12);
  const [lineColor, setLineColor] = useState<string>('#1a73e8');
  const [lineName, setLineName] = useState<string>('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // 問題を読み込む
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      let qs: QuizQuestion[] = [];

      if (config.scopeType === 'line') {
        qs = await generateLineQuiz(config.scopeId);
        const info = await getLineInfo(config.scopeId);
        if (info && !cancelled) {
          setLineColor(info.color);
          setLineName(info.name);
          // 路線の中央あたりにフォーカス
          if (info.stations.length > 0) {
            const midIdx = Math.floor(info.stations.length / 2);
            const mid = info.stations[midIdx];
            setMapCenter([mid.lat, mid.lng]);
            setMapZoom(12);
          }
        }
      } else if (config.scopeType === 'ward') {
        qs = await generateWardQuiz(config.scopeId);
        const center = await getWardCenter(config.scopeId);
        if (center && !cancelled) {
          setMapCenter([center.lat, center.lng]);
          setMapZoom(13);
        }
      } else if (config.scopeType === 'theme') {
        qs = generateRiverQuiz();
        setMapCenter([35.6762, 139.6503]);
        setMapZoom(11);
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

      return {
        questionId: q.id,
        userAnswer,
        correctAnswer,
        isCorrect,
      };
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

  // 路線の座標リスト（polyline用）
  const lineCoords: [number, number][] =
    config.scopeType === 'line'
      ? questions.filter((q) => q.lat && q.lng).map((q) => [q.lat!, q.lng!])
      : [];

  // 駅マーカー用データ
  const stationMarkers = questions.filter((q) => q.lat && q.lng);

  return (
    <div className="quiz-session">
      <div className="quiz-session__left">
        <div className="quiz-session__header">
          <h2 className="quiz-session__title">
            {config.scopeType === 'line' && lineName}
            {config.scopeType === 'ward' && '区内の地理'}
            {config.scopeType === 'theme' && '河川クイズ'}
          </h2>
          <span className="quiz-session__count">
            {answeredCount}/{questions.length}
          </span>
        </div>

        {/* Progress bar */}
        <div className="quiz-session__progress">
          <div className="quiz-session__progress-bar" style={{ width: `${progress * 100}%` }} />
        </div>

        {/* Question inputs */}
        <div className="quiz-session__questions">
          {questions.map((q, i) => (
            <div key={q.id} className="quiz-session__question">
              <span className="quiz-session__question-num">{i + 1}.</span>
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
                placeholder={config.showHints && q.hint ? q.hint : `${i + 1}番目`}
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

      {/* Map */}
      <div className="quiz-session__right">
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          scrollWheelZoom={true}
          className="quiz-session__map"
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
          />
          {lineCoords.length > 1 && (
            <Polyline
              positions={lineCoords}
              pathOptions={{ color: lineColor, weight: 3, opacity: 0.7 }}
            />
          )}
          {stationMarkers.map((q) => (
            <Marker key={q.id} position={[q.lat!, q.lng!]} icon={stationIcon}>
              {submitted && (
                <Popup>
                  <strong>{q.targetName.kanji}</strong>
                </Popup>
              )}
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
