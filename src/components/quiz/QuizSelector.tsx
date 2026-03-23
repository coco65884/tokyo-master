import { useState, useEffect, useCallback } from 'react';
import type { QuizScopeType, DifficultyLevel } from '@/types';
import { getOperatorLines, getWardList, getGenreList } from '@/utils/quizDataLoader';
import { getDifficultySettings } from '@/utils/difficultySettings';
import { useQuizStore } from '@/stores/quizStore';
import DifficultyPicker from './DifficultyPicker';
import type { BlankMapRange } from './BlankMapQuiz';

type TabType = QuizScopeType | 'speedrun' | 'blankmap';

/** スピードランモードの表示フラグ（一時的に非表示） */
const SHOW_SPEEDRUN = false;

/** 事業者キー → 日本語表示名 */
const OPERATOR_LABELS: Record<string, string> = {
  JR: 'JR東日本',
  Metro: '東京メトロ',
  Toei: '都営',
  Keio: '京王電鉄',
  Odakyu: '小田急電鉄',
  Tokyu: '東急電鉄',
  Seibu: '西武鉄道',
  Keikyu: '京浜急行',
  Tobu: '東武鉄道',
  TX: 'つくばエクスプレス',
  Keisei: '京成電鉄',
  Yurikamome: 'ゆりかもめ',
  TWR: 'りんかい線',
  TamaMonorail: '多摩モノレール',
};

/** localStorage から前回の難易度を復元する */
function loadPreferredDifficulty(): DifficultyLevel {
  try {
    const stored = localStorage.getItem('tokyo-master-difficulty');
    if (stored === 'kantan' || stored === 'futsuu' || stored === 'muzukashii') return stored;
  } catch {
    // ignore
  }
  return 'futsuu';
}

interface Props {
  onStart: () => void;
  onStartSpeedRun?: (lineKey: string) => void;
  onStartBlankMap?: (range: BlankMapRange) => void;
}

interface OperatorData {
  operators: string[];
  byOperator: Record<string, { key: string; name: string; stationCount: number; color: string }[]>;
}

export default function QuizSelector({ onStart, onStartSpeedRun, onStartBlankMap }: Props) {
  const setConfig = useQuizStore((s) => s.setConfig);
  const getBestAccuracy = useQuizStore((s) => s.getBestAccuracy);
  const getBestSpeedRun = useQuizStore((s) => s.getBestSpeedRun);

  const [tab, setTab] = useState<TabType>('line');
  const [operatorData, setOperatorData] = useState<OperatorData | null>(null);
  const [selectedOperator, setSelectedOperator] = useState<string>('');
  const [selectedLine, setSelectedLine] = useState<string>('');
  const [selectedWard, setSelectedWard] = useState<string>('');
  const [selectedTheme, setSelectedTheme] = useState<string>('rivers');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(loadPreferredDifficulty);
  // Blank map state
  const [blankMapRange, setBlankMapRange] = useState<BlankMapRange>('ku');
  // Speed run state
  const [speedRunOperator, setSpeedRunOperator] = useState<string>('');
  const [speedRunLine, setSpeedRunLine] = useState<string>('');

  const wardList = getWardList();
  const genreList = getGenreList();

  useEffect(() => {
    getOperatorLines().then((data) => {
      setOperatorData(data);
      if (data.operators.length > 0) {
        setSelectedOperator(data.operators[0]);
        setSpeedRunOperator(data.operators[0]);
      }
    });
  }, []);

  const handleOperatorChange = useCallback((op: string) => {
    setSelectedOperator(op);
    setSelectedLine('');
  }, []);

  const handleSpeedRunOperatorChange = useCallback((op: string) => {
    setSpeedRunOperator(op);
    setSpeedRunLine('');
  }, []);

  const handleDifficultyChange = useCallback((level: DifficultyLevel) => {
    setDifficulty(level);
    try {
      localStorage.setItem('tokyo-master-difficulty', level);
    } catch {
      // ignore
    }
  }, []);

  const currentScopeId =
    tab === 'line' ? selectedLine : tab === 'ward' ? selectedWard : selectedTheme;

  const canStart =
    (tab === 'line' && selectedLine !== '') ||
    (tab === 'ward' && selectedWard !== '') ||
    (tab === 'theme' && selectedTheme !== '');

  const bestAccuracy =
    canStart && currentScopeId ? getBestAccuracy(tab as QuizScopeType, currentScopeId) : 0;

  const handleStart = () => {
    if (!canStart) return;
    const settings = getDifficultySettings(difficulty);
    setConfig({
      scopeType: tab as QuizScopeType,
      scopeId: currentScopeId,
      difficulty,
      answerMode: settings.answerMode,
      showHints: settings.showHints,
    });
    onStart();
  };

  const handleSpeedRunStart = () => {
    if (!speedRunLine || !onStartSpeedRun) return;
    onStartSpeedRun(speedRunLine);
  };

  const speedRunBest = speedRunLine ? getBestSpeedRun(speedRunLine) : null;

  return (
    <div className="quiz-selector">
      {/* Tabs */}
      <div className="quiz-selector__tabs">
        <button
          className={`quiz-selector__tab ${tab === 'line' ? 'quiz-selector__tab--active' : ''}`}
          onClick={() => setTab('line')}
        >
          路線クイズ
        </button>
        <button
          className={`quiz-selector__tab ${tab === 'ward' ? 'quiz-selector__tab--active' : ''}`}
          onClick={() => setTab('ward')}
        >
          区/市クイズ
        </button>
        <button
          className={`quiz-selector__tab ${tab === 'theme' ? 'quiz-selector__tab--active' : ''}`}
          onClick={() => setTab('theme')}
        >
          テーマクイズ
        </button>
        {SHOW_SPEEDRUN && (
          <button
            className={`quiz-selector__tab ${tab === 'speedrun' ? 'quiz-selector__tab--active' : ''}`}
            onClick={() => setTab('speedrun')}
          >
            スピードラン
          </button>
        )}
        <button
          className={`quiz-selector__tab ${tab === 'blankmap' ? 'quiz-selector__tab--active' : ''}`}
          onClick={() => setTab('blankmap')}
        >
          白地図
        </button>
      </div>

      {/* Tab content */}
      <div className="quiz-selector__content">
        {tab === 'line' && operatorData && (
          <div className="quiz-selector__line-picker">
            <label className="quiz-selector__label">事業者</label>
            <select
              className="quiz-selector__select"
              value={selectedOperator}
              onChange={(e) => handleOperatorChange(e.target.value)}
            >
              {operatorData.operators.map((op) => (
                <option key={op} value={op}>
                  {OPERATOR_LABELS[op] ?? op}
                </option>
              ))}
            </select>

            {selectedOperator && operatorData.byOperator[selectedOperator] && (
              <>
                <label className="quiz-selector__label">路線</label>
                <select
                  className="quiz-selector__select"
                  value={selectedLine}
                  onChange={(e) => setSelectedLine(e.target.value)}
                >
                  <option value="">選択してください</option>
                  {operatorData.byOperator[selectedOperator].map((line) => (
                    <option key={line.key} value={line.key}>
                      {line.name} ({line.stationCount}駅)
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        )}

        {tab === 'ward' && (
          <div className="quiz-selector__ward-picker">
            <label className="quiz-selector__label">区/市を選択</label>
            <select
              className="quiz-selector__select"
              value={selectedWard}
              onChange={(e) => setSelectedWard(e.target.value)}
            >
              <option value="">選択してください</option>
              <optgroup label="特別区">
                {wardList
                  .filter((w) => w.type === 'ku')
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="市">
                {wardList
                  .filter((w) => w.type === 'shi')
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="町村">
                {wardList
                  .filter((w) => w.type !== 'ku' && w.type !== 'shi')
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>
        )}

        {tab === 'theme' && (
          <div className="quiz-selector__theme-picker">
            <label className="quiz-selector__label">テーマ</label>
            <select
              className="quiz-selector__select"
              value={selectedTheme}
              onChange={(e) => setSelectedTheme(e.target.value)}
            >
              {genreList.map((genre) => (
                <option key={genre.key} value={genre.key}>
                  {genre.icon} {genre.label} ({genre.count})
                </option>
              ))}
            </select>
          </div>
        )}

        {tab === 'speedrun' && operatorData && (
          <div className="quiz-selector__speedrun-picker">
            <p className="quiz-selector__mode-desc">
              路線の全駅を始発から終点まで、できるだけ速く答えるモードです。
            </p>
            <label className="quiz-selector__label">事業者</label>
            <select
              className="quiz-selector__select"
              value={speedRunOperator}
              onChange={(e) => handleSpeedRunOperatorChange(e.target.value)}
            >
              {operatorData.operators.map((op) => (
                <option key={op} value={op}>
                  {OPERATOR_LABELS[op] ?? op}
                </option>
              ))}
            </select>

            {speedRunOperator && operatorData.byOperator[speedRunOperator] && (
              <>
                <label className="quiz-selector__label">路線</label>
                <select
                  className="quiz-selector__select"
                  value={speedRunLine}
                  onChange={(e) => setSpeedRunLine(e.target.value)}
                >
                  <option value="">選択してください</option>
                  {operatorData.byOperator[speedRunOperator].map((line) => (
                    <option key={line.key} value={line.key}>
                      {line.name} ({line.stationCount}駅)
                    </option>
                  ))}
                </select>
              </>
            )}

            {speedRunBest && (
              <div className="quiz-selector__best">
                ベストタイム（全問正解）: {Math.floor(speedRunBest.elapsedMs / 60000)}:
                {String(Math.floor((speedRunBest.elapsedMs % 60000) / 1000)).padStart(2, '0')}
              </div>
            )}
          </div>
        )}

        {tab === 'blankmap' && (
          <div className="quiz-selector__blankmap-info">
            <p className="quiz-selector__mode-desc">
              東京都の白地図上で、各区/市の名前を当てるモードです。地図上の区域をクリックして名前を入力してください。
            </p>
            <label className="quiz-selector__label">出題範囲</label>
            <select
              className="quiz-selector__select"
              value={blankMapRange}
              onChange={(e) => setBlankMapRange(e.target.value as BlankMapRange)}
            >
              <option value="ku">23区のみ</option>
              <option value="city">東京全域（市含む）</option>
              <option value="all">東京都全部（島含む）</option>
            </select>
          </div>
        )}
      </div>

      {/* Difficulty picker (standard quiz modes) */}
      {(tab === 'line' || tab === 'ward' || tab === 'theme') && (
        <div className="quiz-selector__settings">
          <DifficultyPicker value={difficulty} onChange={handleDifficultyChange} />
        </div>
      )}

      {/* Best score (standard modes) */}
      {(tab === 'line' || tab === 'ward' || tab === 'theme') && bestAccuracy > 0 && (
        <div className="quiz-selector__best">ベスト: {Math.round(bestAccuracy * 100)}%</div>
      )}

      {/* Start button */}
      {(tab === 'line' || tab === 'ward' || tab === 'theme') && (
        <button className="quiz-selector__start-btn" disabled={!canStart} onClick={handleStart}>
          クイズ開始
        </button>
      )}

      {SHOW_SPEEDRUN && tab === 'speedrun' && (
        <button
          className="quiz-selector__start-btn"
          disabled={!speedRunLine}
          onClick={handleSpeedRunStart}
        >
          スピードラン開始
        </button>
      )}

      {tab === 'blankmap' && (
        <button
          className="quiz-selector__start-btn"
          onClick={() => onStartBlankMap?.(blankMapRange)}
        >
          白地図クイズ開始
        </button>
      )}
    </div>
  );
}
