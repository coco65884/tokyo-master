import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { FeatureCollection, Feature } from 'geojson';
import 'leaflet/dist/leaflet.css';
import { loadWards } from '@/utils/dataLoader';
import { matchesNameString } from '@/utils/nameMatch';
import type { DifficultyLevel, QuizChoice } from '@/types';
import { getDifficultySettings } from '@/utils/difficultySettings';
import ChoiceButton from './ChoiceButton';

interface WardEntry {
  wardId: string;
  wardName: string;
  center: [number, number];
}

/** 白地図クイズの出題範囲 */
export type BlankMapRange = 'ku' | 'city' | 'all';

const RANGE_LABELS: Record<BlankMapRange, string> = {
  ku: '23区のみ',
  city: '東京全域（市含む）',
  all: '東京都全部（島含む）',
};

interface Props {
  onBack: () => void;
  range: BlankMapRange;
  difficulty: DifficultyLevel;
}

function FitBounds({ data }: { data: FeatureCollection }) {
  const map = useMap();
  useEffect(() => {
    const geoLayer = L.geoJSON(data);
    const bounds = geoLayer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [data, map]);
  return null;
}

function filterByRange(data: FeatureCollection, range: BlankMapRange): FeatureCollection {
  if (range === 'all') return data;
  const filtered = data.features.filter((f) => {
    const type = f.properties?.type as string;
    if (range === 'ku') return type === 'ku';
    return type === 'ku' || type === 'shi';
  });
  return { ...data, features: filtered };
}

function getCentroid(feature: Feature): [number, number] {
  const coords: number[][] = [];
  const geom = feature.geometry;
  if (geom.type === 'Polygon') {
    for (const ring of geom.coordinates) coords.push(...(ring as number[][]));
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates)
      for (const ring of poly) coords.push(...(ring as number[][]));
  }
  if (coords.length === 0) return [35.68, 139.75];
  const sumLat = coords.reduce((s, c) => s + c[1], 0);
  const sumLng = coords.reduce((s, c) => s + c[0], 0);
  return [sumLat / coords.length, sumLng / coords.length];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function BlankMapQuiz({ onBack, range, difficulty }: Props) {
  const diffSettings = useMemo(() => getDifficultySettings(difficulty), [difficulty]);

  const [wardsGeo, setWardsGeo] = useState<FeatureCollection | null>(null);
  const [wardList, setWardList] = useState<WardEntry[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // かんたんモード用
  const [mcCurrentIndex, setMcCurrentIndex] = useState(0);
  const [mcAnswers, setMcAnswers] = useState<(boolean | null)[]>([]);
  const [mcLocked, setMcLocked] = useState(false);
  const [mcChoiceStates, setMcChoiceStates] = useState<
    Record<string, 'correct' | 'incorrect' | 'default'>
  >({});

  // むずかしいモード用タイマー
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerEndRef = useRef(0);
  const [timerTick, setTimerTick] = useState(0);

  useEffect(() => {
    loadWards().then((rawData) => {
      const data = filterByRange(rawData, range);
      setWardsGeo(data);
      const entries: WardEntry[] = data.features.map((f) => ({
        wardId: f.properties?.id as string,
        wardName: f.properties?.name as string,
        center: getCentroid(f),
      }));
      setWardList(entries);
      setAnswers(new Array(entries.length).fill(''));
      setMcAnswers(new Array(entries.length).fill(null));
    });
  }, [range]);

  // むずかしいモードタイマー
  useEffect(() => {
    if (!wardList.length || submitted || difficulty !== 'muzukashii') return;
    const totalTime = diffSettings.timeLimitPerQuestion * wardList.length;
    if (totalTime <= 0) return;
    timerEndRef.current = Date.now() + totalTime * 1000;
    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((timerEndRef.current - Date.now()) / 1000));
      setTimerTick(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current!);
        setSubmitted(true);
      }
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [wardList.length, submitted, difficulty, diffSettings.timeLimitPerQuestion]);

  const timeLeft = timerTick;

  const totalWards = wardList.length;
  const answeredCount =
    difficulty === 'kantan'
      ? mcAnswers.filter((a) => a !== null).length
      : answers.filter((a) => a.trim()).length;

  // ふつう: 頭文字ヒント
  const getPlaceholder = useCallback(
    (w: WardEntry, idx: number) => {
      if (diffSettings.showFirstChar) {
        return w.wardName[0] + '○'.repeat(w.wardName.length - 1);
      }
      return `${idx + 1}`;
    },
    [diffSettings.showFirstChar],
  );

  const handleInputChange = useCallback((index: number, value: string) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const nextIdx = answers.findIndex((a, i) => i > index && !a.trim());
        if (nextIdx >= 0) inputRefs.current[nextIdx]?.focus();
      }
    },
    [answers],
  );

  const handleSubmit = useCallback(() => {
    setSubmitted(true);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const handleReset = useCallback(() => {
    setAnswers(new Array(wardList.length).fill(''));
    setMcAnswers(new Array(wardList.length).fill(null));
    setMcCurrentIndex(0);
    setMcLocked(false);
    setMcChoiceStates({});
    setSubmitted(false);
    setFocusedIndex(null);
  }, [wardList.length]);

  // テキスト入力の結果
  const results = useMemo(() => {
    if (!submitted || difficulty === 'kantan') return null;
    return wardList.map((w, i) => ({
      ...w,
      isCorrect: matchesNameString(answers[i], w.wardName),
    }));
  }, [submitted, wardList, answers, difficulty]);

  const correctCount =
    difficulty === 'kantan'
      ? mcAnswers.filter((a) => a === true).length
      : (results?.filter((r) => r.isCorrect).length ?? 0);

  // かんたんモード: 選択肢生成
  const mcChoices = useMemo(() => {
    if (difficulty !== 'kantan' || !wardList.length) return [];
    return wardList.map((w) => {
      const others = wardList.filter((o) => o.wardId !== w.wardId);
      const distractors = shuffle(others)
        .slice(0, 3)
        .map((o) => o.wardName);
      return shuffle([w.wardName, ...distractors]);
    });
  }, [difficulty, wardList]);

  const handleMcChoice = useCallback(
    (choiceName: string) => {
      if (mcLocked || mcCurrentIndex >= wardList.length) return;
      setMcLocked(true);
      const correct = wardList[mcCurrentIndex].wardName;
      const isCorrect = choiceName === correct;

      const newStates: Record<string, string> = {};
      if (isCorrect) {
        newStates[choiceName] = 'correct';
      } else {
        newStates[choiceName] = 'incorrect';
        newStates[correct] = 'correct';
      }
      setMcChoiceStates(newStates as Record<string, 'correct' | 'incorrect' | 'default'>);

      setMcAnswers((prev) => {
        const next = [...prev];
        next[mcCurrentIndex] = isCorrect;
        return next;
      });

      setTimeout(() => {
        if (mcCurrentIndex + 1 >= wardList.length) {
          setSubmitted(true);
        } else {
          setMcCurrentIndex((prev) => prev + 1);
        }
        setMcLocked(false);
        setMcChoiceStates({});
      }, 800);
    },
    [mcLocked, mcCurrentIndex, wardList],
  );

  // 地図スタイル
  const styleFunc = useCallback(
    (feature?: Feature): L.PathOptions => {
      const wardId = feature?.properties?.id as string | undefined;
      if (!wardId) return {};
      const idx = wardList.findIndex((w) => w.wardId === wardId);
      const isFocused = difficulty === 'kantan' ? idx === mcCurrentIndex : idx === focusedIndex;

      if (submitted) {
        const isCorrect =
          difficulty === 'kantan' ? mcAnswers[idx] === true : results?.[idx]?.isCorrect;
        return {
          color: isCorrect ? '#16a34a' : '#dc2626',
          weight: 1.5,
          fillColor: isCorrect ? '#bbf7d0' : '#fecaca',
          fillOpacity: 0.6,
        };
      }
      return {
        color: isFocused ? '#1a73e8' : '#94a3b8',
        weight: isFocused ? 3 : 1.2,
        fillColor: isFocused ? '#bfdbfe' : '#f1f5f9',
        fillOpacity: isFocused ? 0.5 : 0.3,
      };
    },
    [wardList, focusedIndex, mcCurrentIndex, submitted, results, mcAnswers, difficulty],
  );

  if (!wardsGeo) {
    return (
      <div className="blank-map__loading">
        <p>読み込み中...</p>
      </div>
    );
  }

  const geoKey = `blank-${focusedIndex}-${mcCurrentIndex}-${submitted ? 'done' : 'active'}`;

  // ========== かんたんモード ==========
  if (difficulty === 'kantan') {
    const currentWard = wardList[mcCurrentIndex];
    const choices = mcChoices[mcCurrentIndex] ?? [];

    return (
      <div className="mc-session">
        <div className="mc-session__map-area">
          <MapContainer
            center={[35.6762, 139.6503]}
            zoom={10}
            scrollWheelZoom
            className="mc-session__map"
            zoomControl={false}
            attributionControl={false}
          >
            <TileLayer url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png" />
            <GeoJSON key={geoKey} data={wardsGeo} style={styleFunc} />
            <FitBounds data={wardsGeo} />
            {wardList.map((w, i) => (
              <Marker
                key={`num-${w.wardId}`}
                position={w.center}
                icon={L.divIcon({
                  className: `quiz-number-icon${i === mcCurrentIndex ? ' quiz-marker-highlight' : ''}`,
                  html: submitted ? `<span>${w.wardName}</span>` : `<span>${i + 1}</span>`,
                  iconSize: [submitted ? 60 : 22, 22],
                  iconAnchor: [submitted ? 30 : 11, 11],
                })}
              />
            ))}
          </MapContainer>
        </div>
        <div className="mc-session__question-area">
          <div className="mc-session__header">
            <span className="mc-session__title">白地図 — {RANGE_LABELS[range]}</span>
            <span className="mc-session__count">
              {mcCurrentIndex + 1} / {totalWards}
            </span>
          </div>
          <div className="mc-session__progress">
            <div
              className="mc-session__progress-bar"
              style={{ width: `${(mcCurrentIndex / totalWards) * 100}%` }}
            />
          </div>
          {!submitted && currentWard && (
            <>
              <div className="mc-session__prompt">
                <span className="mc-session__prompt-num">{mcCurrentIndex + 1}番の区/市は？</span>
              </div>
              <div className="mc-session__choices">
                {choices.map((name) => {
                  const choice: QuizChoice = {
                    id: name,
                    label: name,
                    isCorrect: name === currentWard.wardName,
                  };
                  const state =
                    mcChoiceStates[name] === 'correct'
                      ? 'correct'
                      : mcChoiceStates[name] === 'incorrect'
                        ? 'wrong'
                        : 'default';
                  return (
                    <ChoiceButton
                      key={name}
                      choice={choice}
                      state={state}
                      disabled={mcLocked}
                      onClick={() => handleMcChoice(name)}
                    />
                  );
                })}
              </div>
            </>
          )}
          {submitted && (
            <div className="blank-map__final">
              <div className="blank-map__final-score">
                {Math.round((correctCount / totalWards) * 100)}%
              </div>
              <p className="blank-map__final-detail">
                {correctCount} / {totalWards} 正解
              </p>
            </div>
          )}
          {submitted && (
            <div className="blank-map__actions">
              <button className="blank-map__reset-btn" onClick={handleReset}>
                もう一度
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ========== ふつう・むずかしいモード ==========
  return (
    <div className="quiz-session">
      <div className="quiz-session__left">
        <div className="quiz-session__header">
          <h2 className="quiz-session__title">白地図 — {RANGE_LABELS[range]}</h2>
          <span className="quiz-session__count">
            {answeredCount}/{totalWards}
          </span>
          {difficulty === 'muzukashii' && !submitted && diffSettings.timeLimitPerQuestion > 0 && (
            <span
              className={`quiz-session__timer ${timeLeft <= 10 ? 'quiz-session__timer--urgent' : ''}`}
            >
              ⏱ {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
            </span>
          )}
        </div>
        <div className="quiz-session__progress">
          <div
            className="quiz-session__progress-bar"
            style={{ width: `${(answeredCount / totalWards) * 100}%` }}
          />
        </div>
        <div className="quiz-session__questions">
          {wardList.map((w, i) => (
            <div key={w.wardId} className="quiz-session__question">
              <span className="quiz-session__question-num">{i + 1}</span>
              <input
                ref={(el) => {
                  inputRefs.current[i] = el;
                }}
                className={`quiz-session__input ${submitted ? (results?.[i]?.isCorrect ? 'quiz-session__input--correct' : 'quiz-session__input--incorrect') : ''}`}
                type="text"
                value={answers[i] ?? ''}
                onChange={(e) => handleInputChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, i)}
                onFocus={() => setFocusedIndex(i)}
                placeholder={getPlaceholder(w, i)}
                disabled={submitted}
                autoComplete="off"
              />
              {submitted && <span className="quiz-session__correct-answer">{w.wardName}</span>}
            </div>
          ))}
        </div>
        {!submitted && (
          <button
            className="quiz-session__submit-btn"
            onClick={handleSubmit}
            disabled={answeredCount === 0}
          >
            回答する
          </button>
        )}
        {submitted && (
          <div className="blank-map__final">
            <div className="blank-map__final-score">
              {Math.round((correctCount / totalWards) * 100)}%
            </div>
            <p className="blank-map__final-detail">
              {correctCount} / {totalWards} 正解
            </p>
          </div>
        )}
        <div className="blank-map__actions">
          {submitted && (
            <button className="blank-map__reset-btn" onClick={handleReset}>
              もう一度
            </button>
          )}
          <button className="blank-map__back-btn" onClick={onBack}>
            戻る
          </button>
        </div>
      </div>
      <div className="quiz-session__right">
        <MapContainer
          center={[35.6762, 139.6503]}
          zoom={10}
          scrollWheelZoom
          doubleClickZoom={false}
          className="quiz-session__map"
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
          />
          <GeoJSON key={geoKey} data={wardsGeo} style={styleFunc} />
          <FitBounds data={wardsGeo} />
          {wardList.map((w, i) => (
            <Marker
              key={`num-${w.wardId}`}
              position={w.center}
              icon={L.divIcon({
                className: `quiz-number-icon${i === focusedIndex ? ' quiz-marker-highlight' : ''}`,
                html: submitted ? `<span>${w.wardName}</span>` : `<span>${i + 1}</span>`,
                iconSize: [submitted ? 60 : 22, 22],
                iconAnchor: [submitted ? 30 : 11, 11],
              })}
              eventHandlers={{
                click: () => {
                  if (!submitted) {
                    setFocusedIndex(i);
                    inputRefs.current[i]?.focus();
                  }
                },
              }}
            >
              {submitted && (
                <Tooltip
                  permanent
                  direction="bottom"
                  offset={[0, 8]}
                  className="quiz-station-number"
                >
                  {results?.[i]?.isCorrect ? '✓' : '✗'}
                </Tooltip>
              )}
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
