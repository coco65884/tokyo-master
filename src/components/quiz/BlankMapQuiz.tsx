import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { FeatureCollection, Feature } from 'geojson';
import 'leaflet/dist/leaflet.css';
import { loadWards } from '@/utils/dataLoader';
import { matchesNameString } from '@/utils/nameMatch';

interface WardEntry {
  wardId: string;
  wardName: string;
  center: [number, number]; // [lat, lng]
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
}

/** Fit map to wards GeoJSON bounds */
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

/** ポリゴンの重心を計算 */
function getCentroid(feature: Feature): [number, number] {
  const coords: number[][] = [];
  const geom = feature.geometry;
  if (geom.type === 'Polygon') {
    for (const ring of geom.coordinates) {
      coords.push(...(ring as number[][]));
    }
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      for (const ring of poly) {
        coords.push(...(ring as number[][]));
      }
    }
  }
  if (coords.length === 0) return [35.68, 139.75];
  const sumLat = coords.reduce((s, c) => s + c[1], 0);
  const sumLng = coords.reduce((s, c) => s + c[0], 0);
  return [sumLat / coords.length, sumLng / coords.length];
}

export default function BlankMapQuiz({ onBack, range }: Props) {
  const [wardsGeo, setWardsGeo] = useState<FeatureCollection | null>(null);
  const [wardList, setWardList] = useState<WardEntry[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

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
    });
  }, [range]);

  const totalWards = wardList.length;

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
        // Move to next unanswered input
        const nextIdx = answers.findIndex((a, i) => i > index && !a.trim());
        if (nextIdx >= 0) {
          inputRefs.current[nextIdx]?.focus();
        }
      }
    },
    [answers],
  );

  const handleSubmit = useCallback(() => {
    setSubmitted(true);
  }, []);

  const handleReset = useCallback(() => {
    setAnswers(new Array(wardList.length).fill(''));
    setSubmitted(false);
    setFocusedIndex(null);
  }, [wardList.length]);

  const results = useMemo(() => {
    if (!submitted) return null;
    return wardList.map((w, i) => ({
      ...w,
      userAnswer: answers[i],
      isCorrect: matchesNameString(answers[i], w.wardName),
    }));
  }, [submitted, wardList, answers]);

  const correctCount = results?.filter((r) => r.isCorrect).length ?? 0;
  const answeredCount = answers.filter((a) => a.trim()).length;

  const styleFunc = useCallback(
    (feature?: Feature): L.PathOptions => {
      const wardId = feature?.properties?.id as string | undefined;
      if (!wardId) return {};

      const idx = wardList.findIndex((w) => w.wardId === wardId);
      const isFocused = idx === focusedIndex;

      if (submitted && results) {
        const r = results[idx];
        if (r?.isCorrect) {
          return {
            color: '#16a34a',
            weight: isFocused ? 3 : 1.5,
            fillColor: '#bbf7d0',
            fillOpacity: 0.6,
          };
        }
        return {
          color: '#dc2626',
          weight: isFocused ? 3 : 1.5,
          fillColor: '#fecaca',
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
    [wardList, focusedIndex, submitted, results],
  );

  if (!wardsGeo) {
    return (
      <div className="blank-map__loading">
        <p>読み込み中...</p>
      </div>
    );
  }

  const geoKey = `blank-${focusedIndex}-${submitted ? 'done' : 'active'}`;

  return (
    <div className="quiz-session">
      <div className="quiz-session__left">
        <div className="quiz-session__header">
          <h2 className="quiz-session__title">白地図 — {RANGE_LABELS[range]}</h2>
          <span className="quiz-session__count">
            {answeredCount}/{totalWards}
          </span>
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
                className={`quiz-session__input ${
                  submitted
                    ? results?.[i]?.isCorrect
                      ? 'quiz-session__input--correct'
                      : 'quiz-session__input--incorrect'
                    : ''
                }`}
                type="text"
                value={answers[i] ?? ''}
                onChange={(e) => handleInputChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, i)}
                onFocus={() => setFocusedIndex(i)}
                placeholder={`${i + 1}`}
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
          scrollWheelZoom={true}
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

          {/* 番号マーカー */}
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
