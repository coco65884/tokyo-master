import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import QuizSelector from '@/components/quiz/QuizSelector';
import QuizSession from '@/components/quiz/QuizSession';
import QuizResult from '@/components/quiz/QuizResult';
import { useQuizStore } from '@/stores/quizStore';
import type { QuizResult as QuizResultType } from '@/types';
import '@/styles/QuizPage.css';

type Phase = 'select' | 'active' | 'result';

export default function QuizPage() {
  const [phase, setPhase] = useState<Phase>('select');
  const [lastResult, setLastResult] = useState<QuizResultType | null>(null);

  const config = useQuizStore((s) => s.currentConfig);
  const addResult = useQuizStore((s) => s.addResult);

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

  return (
    <div className="quiz-page">
      <header className="quiz-header">
        <Link to="/" className="back-link">
          &larr; ホーム
        </Link>
        <h1>地理クイズ</h1>
      </header>

      <div className="quiz-content">
        {phase === 'select' && <QuizSelector onStart={handleStart} />}

        {phase === 'active' && config && (
          <QuizSession config={config} onComplete={handleComplete} />
        )}

        {phase === 'result' && lastResult && (
          <QuizResult
            result={lastResult}
            onRetry={handleRetry}
            onBackToSelector={handleBackToSelector}
          />
        )}
      </div>
    </div>
  );
}
