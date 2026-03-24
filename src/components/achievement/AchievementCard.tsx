import type { AchievementDefinition, UserAchievement } from '@/types';

const RANK_STYLES: Record<string, { border: string; bg: string; label: string }> = {
  kantan: { border: '#cd7f32', bg: 'linear-gradient(135deg, #cd7f32, #e8a860)', label: '銅' },
  futsuu: { border: '#a8a8a8', bg: 'linear-gradient(135deg, #a8a8a8, #d4d4d4)', label: '銀' },
  muzukashii: { border: '#ffd700', bg: 'linear-gradient(135deg, #ffd700, #ffed4a)', label: '金' },
};

interface Props {
  definition: AchievementDefinition;
  userAchievement?: UserAchievement;
  onClick: () => void;
}

export default function AchievementCard({ definition, userAchievement, onClick }: Props) {
  const achieved = userAchievement?.achieved ?? false;
  const bestAccuracy = userAchievement?.bestAccuracy ?? 0;
  const hasAttempt = (userAchievement?.attempts ?? 0) > 0;
  const rank = definition.difficulty ? RANK_STYLES[definition.difficulty] : null;

  return (
    <button
      className={`achievement-card ${achieved ? 'achievement-card--achieved' : ''} ${hasAttempt && !achieved ? 'achievement-card--attempted' : ''}`}
      onClick={onClick}
      type="button"
    >
      {/* 難易度ランクバッジ */}
      {rank && (
        <span
          className="achievement-card__rank"
          style={{
            background: rank.bg,
            borderColor: rank.border,
          }}
        >
          {rank.label}
        </span>
      )}

      <div
        className="achievement-card__badge"
        style={{
          backgroundColor: achieved ? definition.color : undefined,
          borderColor: achieved ? definition.color : rank ? rank.border : undefined,
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
