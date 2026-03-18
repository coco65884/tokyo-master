import { useState, useEffect, useCallback } from 'react';
import type { QuizScopeType } from '@/types';
import { getOperatorLines, getWardList } from '@/utils/quizDataLoader';
import { useQuizStore } from '@/stores/quizStore';

interface Props {
  onStart: () => void;
}

interface OperatorData {
  operators: string[];
  byOperator: Record<string, { key: string; name: string; stationCount: number; color: string }[]>;
}

export default function QuizSelector({ onStart }: Props) {
  const setConfig = useQuizStore((s) => s.setConfig);
  const getBestAccuracy = useQuizStore((s) => s.getBestAccuracy);

  const [tab, setTab] = useState<QuizScopeType>('line');
  const [operatorData, setOperatorData] = useState<OperatorData | null>(null);
  const [selectedOperator, setSelectedOperator] = useState<string>('');
  const [selectedLine, setSelectedLine] = useState<string>('');
  const [selectedWard, setSelectedWard] = useState<string>('');
  const [selectedTheme, setSelectedTheme] = useState<string>('rivers');
  const [showHints, setShowHints] = useState<boolean>(true);

  const wardList = getWardList();

  useEffect(() => {
    getOperatorLines().then((data) => {
      setOperatorData(data);
      if (data.operators.length > 0) {
        setSelectedOperator(data.operators[0]);
      }
    });
  }, []);

  const handleOperatorChange = useCallback((op: string) => {
    setSelectedOperator(op);
    setSelectedLine('');
  }, []);

  const currentScopeId =
    tab === 'line' ? selectedLine : tab === 'ward' ? selectedWard : selectedTheme;

  const canStart =
    (tab === 'line' && selectedLine !== '') ||
    (tab === 'ward' && selectedWard !== '') ||
    (tab === 'theme' && selectedTheme !== '');

  const bestAccuracy = canStart && currentScopeId ? getBestAccuracy(tab, currentScopeId) : 0;

  const handleStart = () => {
    if (!canStart) return;
    setConfig({
      scopeType: tab,
      scopeId: currentScopeId,
      answerMode: 'text',
      showHints,
    });
    onStart();
  };

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
      </div>

      {/* Settings */}
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

      {/* Best score */}
      {bestAccuracy > 0 && (
        <div className="quiz-selector__best">ベスト: {Math.round(bestAccuracy * 100)}%</div>
      )}

      {/* Start button */}
      <button className="quiz-selector__start-btn" disabled={!canStart} onClick={handleStart}>
        クイズ開始
      </button>
    </div>
  );
}
