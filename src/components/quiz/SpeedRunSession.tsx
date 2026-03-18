import { useState, useEffect, useRef, useCallback } from 'react';
import type { QuizQuestion } from '@/types';
import { matchesNameString } from '@/utils/nameMatch';
import { generateLineQuiz, getLineInfo } from '@/utils/quizDataLoader';
import { useQuizStore } from '@/stores/quizStore';
import type { SpeedRunRecord } from '@/stores/quizStore';

interface Props {
  lineKey: string;
  onComplete: (record: SpeedRunRecord) => void;
  onBack: () => void;
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const centisec = Math.floor((ms % 1000) / 10);
  return `${min}:${String(sec).padStart(2, '0')}.${String(centisec).padStart(2, '0')}`;
}

export default function SpeedRunSession({ lineKey, onComplete, onBack }: Props) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lineName, setLineName] = useState('');
  const [results, setResults] = useState<{ correct: boolean; answer: string }[]>([]);
  const [wrongFlash, setWrongFlash] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const bestRecord = useQuizStore((s) => s.getBestSpeedRun(lineKey));

  // Load questions
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const qs = await generateLineQuiz(lineKey);
      const info = await getLineInfo(lineKey);
      if (!cancelled) {
        setQuestions(qs);
        setLineName(info?.name ?? lineKey);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [lineKey]);

  // Timer
  useEffect(() => {
    if (started && !finished) {
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 50);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [started, finished]);

  const handleStart = useCallback(() => {
    setStarted(true);
    startTimeRef.current = Date.now();
    setElapsedMs(0);
    setCurrentIdx(0);
    setResults([]);
    setUserInput('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleSubmitAnswer = useCallback(() => {
    if (!started || finished || currentIdx >= questions.length) return;

    const q = questions[currentIdx];
    const isCorrect = matchesNameString(userInput, q.targetName.kanji);

    if (isCorrect) {
      const newResults = [...results, { correct: true, answer: userInput }];
      setResults(newResults);
      setUserInput('');

      if (currentIdx + 1 >= questions.length) {
        // Finished
        const finalMs = Date.now() - startTimeRef.current;
        setElapsedMs(finalMs);
        setFinished(true);
        if (timerRef.current) clearInterval(timerRef.current);

        const correctCount = newResults.filter((r) => r.correct).length;
        const record: SpeedRunRecord = {
          lineKey,
          lineName,
          elapsedMs: finalMs,
          accuracy: correctCount / questions.length,
          completedAt: new Date().toISOString(),
        };
        onComplete(record);
      } else {
        setCurrentIdx((prev) => prev + 1);
      }
    } else {
      // Wrong answer: flash red briefly, skip this station
      setWrongFlash(true);
      const newResults = [...results, { correct: false, answer: userInput }];
      setResults(newResults);
      setUserInput('');
      setTimeout(() => setWrongFlash(false), 300);

      if (currentIdx + 1 >= questions.length) {
        const finalMs = Date.now() - startTimeRef.current;
        setElapsedMs(finalMs);
        setFinished(true);
        if (timerRef.current) clearInterval(timerRef.current);

        const correctCount = newResults.filter((r) => r.correct).length;
        const record: SpeedRunRecord = {
          lineKey,
          lineName,
          elapsedMs: finalMs,
          accuracy: correctCount / questions.length,
          completedAt: new Date().toISOString(),
        };
        onComplete(record);
      } else {
        setCurrentIdx((prev) => prev + 1);
      }
    }
  }, [started, finished, currentIdx, questions, userInput, results, lineKey, lineName, onComplete]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmitAnswer();
      }
    },
    [handleSubmitAnswer],
  );

  if (loading) {
    return (
      <div className="speed-run__loading">
        <p>読み込み中...</p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="speed-run__empty">
        <p>問題が見つかりませんでした</p>
        <button className="speed-run__back-btn" onClick={onBack}>
          戻る
        </button>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="speed-run__ready">
        <h2 className="speed-run__title">{lineName} スピードラン</h2>
        <p className="speed-run__desc">
          全{questions.length}駅を始発から終点の順に、できるだけ速く答えてください。
        </p>
        {bestRecord && (
          <p className="speed-run__best-time">
            ベストタイム（全問正解）: {formatTime(bestRecord.elapsedMs)}
          </p>
        )}
        <button className="speed-run__start-btn" onClick={handleStart}>
          スタート
        </button>
        <button className="speed-run__back-btn" onClick={onBack}>
          戻る
        </button>
      </div>
    );
  }

  if (finished) {
    const correctCount = results.filter((r) => r.correct).length;
    const accuracyPct = Math.round((correctCount / questions.length) * 100);

    return (
      <div className="speed-run__result">
        <h2 className="speed-run__title">結果</h2>
        <div className="speed-run__timer speed-run__timer--final">{formatTime(elapsedMs)}</div>
        <div className="speed-run__accuracy">
          正答率: {accuracyPct}% ({correctCount}/{questions.length})
        </div>
        {bestRecord && (
          <p className="speed-run__best-time">ベストタイム: {formatTime(bestRecord.elapsedMs)}</p>
        )}
        <div className="speed-run__result-list">
          {questions.map((q, i) => (
            <div
              key={q.id}
              className={`speed-run__result-item ${results[i]?.correct ? 'speed-run__result-item--correct' : 'speed-run__result-item--wrong'}`}
            >
              <span className="speed-run__result-num">{i + 1}.</span>
              <span className="speed-run__result-answer">{q.targetName.kanji}</span>
              {!results[i]?.correct && results[i]?.answer && (
                <span className="speed-run__result-user">({results[i].answer})</span>
              )}
              <span className="speed-run__result-icon">
                {results[i]?.correct ? '\u2713' : '\u2717'}
              </span>
            </div>
          ))}
        </div>
        <div className="speed-run__actions">
          <button className="speed-run__start-btn" onClick={handleStart}>
            もう一度
          </button>
          <button className="speed-run__back-btn" onClick={onBack}>
            戻る
          </button>
        </div>
      </div>
    );
  }

  // Active session
  const currentQ = questions[currentIdx];
  const progress = currentIdx / questions.length;

  return (
    <div className="speed-run__active">
      <div className="speed-run__timer">{formatTime(elapsedMs)}</div>
      <div className="speed-run__progress-bar-wrap">
        <div className="speed-run__progress-bar" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="speed-run__station-info">
        <span className="speed-run__station-num">
          {currentIdx + 1} / {questions.length}
        </span>
        {currentQ.hint && <span className="speed-run__station-hint">{currentQ.hint}</span>}
      </div>
      <input
        ref={inputRef}
        className={`speed-run__input ${wrongFlash ? 'speed-run__input--wrong' : ''}`}
        type="text"
        value={userInput}
        onChange={(e) => setUserInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="駅名を入力..."
        autoComplete="off"
        autoFocus
      />
      <div className="speed-run__past-answers">
        {results.map((r, i) => (
          <span
            key={i}
            className={`speed-run__past ${r.correct ? 'speed-run__past--correct' : 'speed-run__past--wrong'}`}
          >
            {questions[i].targetName.kanji}
          </span>
        ))}
      </div>
    </div>
  );
}
