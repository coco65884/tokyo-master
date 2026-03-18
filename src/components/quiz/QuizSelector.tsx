import { useState, useEffect, useCallback } from 'react';
import type { QuizScopeType } from '@/types';
import { getOperatorLines, getWardList } from '@/utils/quizDataLoader';
import { useQuizStore } from '@/stores/quizStore';

type TabType = QuizScopeType | 'speedrun' | 'blankmap';

interface Props {
  onStart: () => void;
  onStartSpeedRun?: (lineKey: string) => void;
  onStartBlankMap?: () => void;
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
  const [showHints, setShowHints] = useState<boolean>(true);
  // Speed run state
  const [speedRunOperator, setSpeedRunOperator] = useState<string>('');
  const [speedRunLine, setSpeedRunLine] = useState<string>('');

  const wardList = getWardList();

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
    setConfig({
      scopeType: tab as QuizScopeType,
      scopeId: currentScopeId,
      answerMode: 'text',
      showHints,
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
        <button
          className={`quiz-selector__tab ${tab === 'speedrun' ? 'quiz-selector__tab--active' : ''}`}
          onClick={() => setTab('speedrun')}
        >
          スピードラン
        </button>
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
                  {op}
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
              <option value="rivers">河川</option>
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
                  {op}
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
          </div>
        )}
      </div>

      {/* Settings (only for standard quiz modes) */}
      {(tab === 'line' || tab === 'ward' || tab === 'theme') && (
        <div className="quiz-selector__settings">
          <label className="quiz-selector__hint-toggle">
            <input
              type="checkbox"
              checked={showHints}
              onChange={(e) => setShowHints(e.target.checked)}
            />
            ヒントを表示
          </label>
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

      {tab === 'speedrun' && (
        <button
          className="quiz-selector__start-btn"
          disabled={!speedRunLine}
          onClick={handleSpeedRunStart}
        >
          スピードラン開始
        </button>
      )}

      {tab === 'blankmap' && (
        <button className="quiz-selector__start-btn" onClick={() => onStartBlankMap?.()}>
          白地図クイズ開始
        </button>
      )}
    </div>
  );
}
