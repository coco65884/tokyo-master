import type { AchievementDefinition, UserAchievement } from '@/types';

const RANK_COLORS: Record<string, { bg: string; border: string; label: string }> = {
  kantan: { bg: 'linear-gradient(135deg, #cd7f32, #e8a860)', border: '#cd7f32', label: '銅' },
  futsuu: { bg: 'linear-gradient(135deg, #a8a8a8, #d4d4d4)', border: '#a8a8a8', label: '銀' },
  muzukashii: { bg: 'linear-gradient(135deg, #ffd700, #ffed4a)', border: '#ffd700', label: '金' },
};

interface Props {
  definition: AchievementDefinition;
  /** 難易度別の達成状況 (kantan/futsuu/muzukashii) */
  achievementsByDifficulty?: Record<string, UserAchievement | undefined>;
  onClick: () => void;
}

export default function AchievementCard({ definition, achievementsByDifficulty, onClick }: Props) {
  // 最高達成難易度を判定
  const highestRank = (['muzukashii', 'futsuu', 'kantan'] as const).find(
    (d) => achievementsByDifficulty?.[d]?.achieved,
  );
  const hasAttempt = Object.values(achievementsByDifficulty ?? {}).some((a) => a && a.attempts > 0);
  const bestAccuracy = Math.max(
    ...Object.values(achievementsByDifficulty ?? {}).map((a) => a?.bestAccuracy ?? 0),
    0,
  );
  const achieved = !!highestRank;

  return (
    <button
      className={`achievement-card ${achieved ? 'achievement-card--achieved' : ''} ${hasAttempt && !achieved ? 'achievement-card--attempted' : ''}`}
      onClick={onClick}
      type="button"
    >
      {/* 最高達成ランクバッジ */}
      {highestRank && (
        <span
          className="achievement-card__rank"
          style={{ background: RANK_COLORS[highestRank].bg }}
        >
          {RANK_COLORS[highestRank].label}
        </span>
      )}

      <div
        className="achievement-card__badge"
        style={{
          backgroundColor: achieved ? definition.color : undefined,
          borderColor:
            achieved && highestRank
              ? RANK_COLORS[highestRank].border
              : achieved
                ? definition.color
                : undefined,
        }}
      >
        <span className="achievement-card__icon">{definition.icon}</span>
      </div>

      <div className="achievement-card__info">
        <span className="achievement-card__title">{definition.title}</span>
        {hasAttempt && (
          <span className="achievement-card__accuracy">{Math.round(bestAccuracy * 100)}%</span>
        )}
      </div>

      {achieved && <span className="achievement-card__check">&#10003;</span>}
    </button>
  );
}
