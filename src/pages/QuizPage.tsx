import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import QuizSelector from '@/components/quiz/QuizSelector';
import QuizSession from '@/components/quiz/QuizSession';
import MultipleChoiceSession from '@/components/quiz/MultipleChoiceSession';
import QuizResult from '@/components/quiz/QuizResult';
import SpeedRunSession from '@/components/quiz/SpeedRunSession';
import BlankMapQuiz from '@/components/quiz/BlankMapQuiz';
import type { BlankMapRange } from '@/components/quiz/BlankMapQuiz';
import type { DifficultyLevel } from '@/types';
import { useQuizStore } from '@/stores/quizStore';
import type { QuizResult as QuizResultType } from '@/types';
import type { SpeedRunRecord } from '@/stores/quizStore';
import '@/styles/QuizPage.css';

type Phase = 'select' | 'active' | 'result' | 'speedrun' | 'blankmap';

export default function QuizPage() {
  const [phase, setPhase] = useState<Phase>('select');
  const [lastResult, setLastResult] = useState<QuizResultType | null>(null);
  const [speedRunLineKey, setSpeedRunLineKey] = useState<string>('');

  const config = useQuizStore((s) => s.currentConfig);
  const addResult = useQuizStore((s) => s.addResult);
  const addSpeedRunRecord = useQuizStore((s) => s.addSpeedRunRecord);

  const handleStart = useCallback(() => {
    setPhase('active');
  }, []);

  const handleComplete = useCallback(
    (result: QuizResultType) => {
      setLastResult(result);
      addResult(result);
      setPhase('result');
    },
    [addResult],
  );

  const handleRetry = useCallback(() => {
    setPhase('active');
  }, []);

  const handleBackToSelector = useCallback(() => {
    setLastResult(null);
    setPhase('select');
  }, []);

  const handleStartSpeedRun = useCallback((lineKey: string) => {
    setSpeedRunLineKey(lineKey);
    setPhase('speedrun');
  }, []);

  const handleSpeedRunComplete = useCallback(
    (record: SpeedRunRecord) => {
      addSpeedRunRecord(record);
    },
    [addSpeedRunRecord],
  );

  const [blankMapRange, setBlankMapRange] = useState<BlankMapRange>('ku');
  const [blankMapDifficulty, setBlankMapDifficulty] = useState<DifficultyLevel>('futsuu');
  const handleStartBlankMap = useCallback((range: BlankMapRange, difficulty: DifficultyLevel) => {
    setBlankMapRange(range);
    setBlankMapDifficulty(difficulty);
    setPhase('blankmap');
  }, []);

  const isKantanMode = config?.difficulty === 'kantan';

  return (
    <div className="quiz-page">
      <header className="quiz-header">
        <Link to="/" className="back-link">
          &larr; ホーム
        </Link>
        <h1>地理クイズ</h1>
      </header>

      <div className="quiz-content">
        {phase === 'select' && (
          <QuizSelector
            onStart={handleStart}
            onStartSpeedRun={handleStartSpeedRun}
            onStartBlankMap={handleStartBlankMap}
          />
        )}

        {phase === 'active' &&
          config &&
          (isKantanMode ? (
            <MultipleChoiceSession config={config} onComplete={handleComplete} />
          ) : (
            <QuizSession config={config} onComplete={handleComplete} />
          ))}

        {phase === 'result' && lastResult && (
          <QuizResult
            result={lastResult}
            config={config}
            onRetry={handleRetry}
            onBackToSelector={handleBackToSelector}
          />
        )}

        {phase === 'speedrun' && speedRunLineKey && (
          <SpeedRunSession
            lineKey={speedRunLineKey}
            onComplete={handleSpeedRunComplete}
            onBack={handleBackToSelector}
          />
        )}

        {phase === 'blankmap' && (
          <BlankMapQuiz
            onBack={handleBackToSelector}
            range={blankMapRange}
            difficulty={blankMapDifficulty}
          />
        )}
      </div>
    </div>
  );
}
