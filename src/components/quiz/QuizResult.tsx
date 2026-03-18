import { useEffect, useRef } from 'react';
import type { QuizResult as QuizResultType } from '@/types';
import { useAchievementStore } from '@/stores/achievementStore';
import { getAchievementId } from '@/data/achievements';

interface Props {
  result: QuizResultType;
  onRetry: () => void;
  onBackToSelector: () => void;
}

export default function QuizResult({ result, onRetry, onBackToSelector }: Props) {
  const updateAchievement = useAchievementStore((s) => s.updateAchievement);
  const hasUpdatedRef = useRef(false);

  const accuracyPercent = Math.round(result.accuracy * 100);

  // Update achievement when result is shown
  useEffect(() => {
    if (hasUpdatedRef.current) return;
    hasUpdatedRef.current = true;

    const achievementId = getAchievementId(result.scopeType, result.scopeId);
    updateAchievement(achievementId, result.accuracy);
  }, [result, updateAchievement]);

  const getAccuracyClass = () => {
    if (accuracyPercent >= 80) return 'quiz-result__score--great';
    if (accuracyPercent >= 50) return 'quiz-result__score--good';
    return 'quiz-result__score--needs-work';
  };

  const achievementId = getAchievementId(result.scopeType, result.scopeId);
  const userAchievement = useAchievementStore((s) => s.achievements[achievementId]);
  const justAchieved = result.accuracy === 1 && userAchievement?.attempts === 1;

  return (
    <div className="quiz-result">
      <h2 className="quiz-result__title">結果</h2>

      <div className={`quiz-result__score ${getAccuracyClass()}`}>
        <span className="quiz-result__score-number">{accuracyPercent}%</span>
        <span className="quiz-result__score-detail">
          {result.correctAnswers} / {result.totalQuestions} 正解
        </span>
      </div>

      {/* Achievement notification */}
      {result.accuracy === 1 && (
        <div className="quiz-result__achievement-notice">
          {justAchieved
            ? 'アチーブメント達成！おめでとうございます！'
            : 'アチーブメント達成済み &#10003;'}
        </div>
      )}

      {/* Answer list */}
      <div className="quiz-result__answers">
        <h3 className="quiz-result__answers-title">回答一覧</h3>
        <div className="quiz-result__answer-list">
          {result.answers.map((answer, idx) => (
            <div
              key={answer.questionId}
              className={`quiz-result__answer ${
                answer.isCorrect ? 'quiz-result__answer--correct' : 'quiz-result__answer--incorrect'
              }`}
            >
              <span className="quiz-result__answer-num">{idx + 1}.</span>
              <span className="quiz-result__answer-correct">{answer.correctAnswer}</span>
              {!answer.isCorrect && answer.userAnswer && (
                <span className="quiz-result__answer-user">({answer.userAnswer})</span>
              )}
              <span className="quiz-result__answer-icon">
                {answer.isCorrect ? '\u2713' : '\u2717'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="quiz-result__actions">
        <button className="quiz-result__retry-btn" onClick={onRetry}>
          もう一度挑戦
        </button>
        <button className="quiz-result__back-btn" onClick={onBackToSelector}>
          クイズ選択に戻る
        </button>
      </div>
    </div>
  );
}
