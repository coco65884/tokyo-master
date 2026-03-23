import { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { FeatureCollection, Feature } from 'geojson';
import 'leaflet/dist/leaflet.css';
import { loadWards } from '@/utils/dataLoader';
import { matchesNameString } from '@/utils/nameMatch';

interface WardAnswer {
  wardId: string;
  wardName: string;
  userAnswer: string;
  isCorrect: boolean | null; // null = not answered
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
    // 'city' = 23区 + 市
    return type === 'ku' || type === 'shi';
  });
  return { ...data, features: filtered };
}

export default function BlankMapQuiz({ onBack, range }: Props) {
  const [wardsGeo, setWardsGeo] = useState<FeatureCollection | null>(null);
  const [answers, setAnswers] = useState<Record<string, WardAnswer>>({});
  const [selectedWardId, setSelectedWardId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [finished, setFinished] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadWards().then((rawData) => {
      const data = filterByRange(rawData, range);
      setWardsGeo(data);
      // Initialize answers for filtered wards
      const init: Record<string, WardAnswer> = {};
      for (const feature of data.features) {
        const id = feature.properties?.id as string;
        const name = feature.properties?.name as string;
        init[id] = { wardId: id, wardName: name, userAnswer: '', isCorrect: null };
      }
      setAnswers(init);
    });
  }, [range]);

  const totalWards = wardsGeo?.features.length ?? 0;
  const answeredCount = Object.values(answers).filter((a) => a.isCorrect !== null).length;
  const correctCount = Object.values(answers).filter((a) => a.isCorrect === true).length;

  const handleWardClick = useCallback(
    (wardId: string) => {
      if (finished) return;
      const ward = answers[wardId];
      if (!ward || ward.isCorrect !== null) return; // Already answered
      setSelectedWardId(wardId);
      setInputValue('');
      setTimeout(() => inputRef.current?.focus(), 50);
    },
    [answers, finished],
  );

  const handleSubmitAnswer = useCallback(() => {
    if (!selectedWardId || finished) return;
    const ward = answers[selectedWardId];
    if (!ward || ward.isCorrect !== null) return;

    const isCorrect = matchesNameString(inputValue, ward.wardName);
    const newAnswers = {
      ...answers,
      [selectedWardId]: {
        ...ward,
        userAnswer: inputValue,
        isCorrect,
      },
    };
    setAnswers(newAnswers);
    setSelectedWardId(null);
    setInputValue('');

    // Check if all answered
    const newAnsweredCount = Object.values(newAnswers).filter((a) => a.isCorrect !== null).length;
    if (newAnsweredCount >= totalWards) {
      setFinished(true);
    }
  }, [selectedWardId, inputValue, answers, finished, totalWards]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmitAnswer();
      }
      if (e.key === 'Escape') {
        setSelectedWardId(null);
        setInputValue('');
      }
    },
    [handleSubmitAnswer],
  );

  const handleFinish = useCallback(() => {
    // Mark all unanswered as incorrect
    const newAnswers = { ...answers };
    for (const id of Object.keys(newAnswers)) {
      if (newAnswers[id].isCorrect === null) {
        newAnswers[id] = { ...newAnswers[id], isCorrect: false };
      }
    }
    setAnswers(newAnswers);
    setFinished(true);
    setSelectedWardId(null);
  }, [answers]);

  const handleReset = useCallback(() => {
    if (!wardsGeo) return;
    const init: Record<string, WardAnswer> = {};
    for (const feature of wardsGeo.features) {
      const id = feature.properties?.id as string;
      const name = feature.properties?.name as string;
      init[id] = { wardId: id, wardName: name, userAnswer: '', isCorrect: null };
    }
    setAnswers(init);
    setFinished(false);
    setSelectedWardId(null);
    setInputValue('');
  }, [wardsGeo]);

  if (!wardsGeo) {
    return (
      <div className="blank-map__loading">
        <p>読み込み中...</p>
      </div>
    );
  }

  const styleFunc = (feature?: Feature): L.PathOptions => {
    const wardId = feature?.properties?.id as string | undefined;
    if (!wardId) return {};

    const ward = answers[wardId];
    const isSelected = wardId === selectedWardId;

    if (ward?.isCorrect === true) {
      return {
        color: '#16a34a',
        weight: isSelected ? 3 : 1.5,
        fillColor: '#bbf7d0',
        fillOpacity: 0.6,
      };
    }
    if (ward?.isCorrect === false) {
      return {
        color: '#dc2626',
        weight: isSelected ? 3 : 1.5,
        fillColor: '#fecaca',
        fillOpacity: 0.6,
      };
    }
    // Unanswered
    return {
      color: isSelected ? '#1a73e8' : '#94a3b8',
      weight: isSelected ? 3 : 1.2,
      fillColor: isSelected ? '#bfdbfe' : '#f1f5f9',
      fillOpacity: isSelected ? 0.5 : 0.3,
    };
  };

  const onEachFeature = (feature: Feature, layer: L.Layer) => {
    const wardId = feature.properties?.id as string;
    const wardName = feature.properties?.name as string;
    const ward = answers[wardId];
    const path = layer as L.Path;

    // Show name only if answered
    if (ward?.isCorrect !== null) {
      path.bindTooltip(wardName, {
        permanent: true,
        direction: 'center',
        className: 'blank-map__ward-label',
      });
    }

    if (!finished && ward?.isCorrect === null) {
      path.on('mouseover', () => {
        if (wardId !== selectedWardId) {
          path.setStyle({ fillColor: '#dbeafe', fillOpacity: 0.4, weight: 2 });
        }
      });
      path.on('mouseout', () => {
        path.setStyle(styleFunc(feature));
      });
    }

    path.on('click', () => {
      handleWardClick(wardId);
    });
  };

  const geoKey = `blank-${answeredCount}-${selectedWardId}-${finished ? 'done' : 'active'}`;

  return (
    <div className="blank-map">
      <div className="blank-map__sidebar">
        <h2 className="blank-map__title">白地図クイズ — {RANGE_LABELS[range]}</h2>
        <p className="blank-map__progress">
          {answeredCount} / {totalWards} 回答済み
          {answeredCount > 0 && ` (${correctCount}問正解)`}
        </p>
        <div className="blank-map__progress-bar-wrap">
          <div
            className="blank-map__progress-bar"
            style={{ width: `${(answeredCount / totalWards) * 100}%` }}
          />
        </div>

        {selectedWardId && !finished && (
          <div className="blank-map__input-area">
            <p className="blank-map__input-label">この区/市の名前は？</p>
            <input
              ref={inputRef}
              className="blank-map__input"
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="名前を入力..."
              autoComplete="off"
            />
            <button
              className="blank-map__submit-btn"
              onClick={handleSubmitAnswer}
              disabled={!inputValue.trim()}
            >
              回答
            </button>
          </div>
        )}

        {!selectedWardId && !finished && (
          <p className="blank-map__hint">地図上の区/市をクリックして回答してください</p>
        )}

        {finished && (
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
          {!finished && answeredCount > 0 && (
            <button className="blank-map__finish-btn" onClick={handleFinish}>
              終了する
            </button>
          )}
          {finished && (
            <button className="blank-map__reset-btn" onClick={handleReset}>
              もう一度
            </button>
          )}
          <button className="blank-map__back-btn" onClick={onBack}>
            戻る
          </button>
        </div>
      </div>

      <div className="blank-map__map-area">
        <MapContainer
          center={[35.6762, 139.6503]}
          zoom={10}
          scrollWheelZoom={true}
          doubleClickZoom={false}
          className="blank-map__map"
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
          />
          <GeoJSON key={geoKey} data={wardsGeo} style={styleFunc} onEachFeature={onEachFeature} />
          <FitBounds data={wardsGeo} />
        </MapContainer>
      </div>
    </div>
  );
}
