import type { AchievementDefinition, UserAchievement } from '@/types';

interface Props {
  definition: AchievementDefinition;
  userAchievement?: UserAchievement;
  onClick: () => void;
}

export default function AchievementCard({ definition, userAchievement, onClick }: Props) {
  const achieved = userAchievement?.achieved ?? false;
  const bestAccuracy = userAchievement?.bestAccuracy ?? 0;
  const hasAttempt = (userAchievement?.attempts ?? 0) > 0;

  return (
    <button
      className={`achievement-card ${achieved ? 'achievement-card--achieved' : ''} ${hasAttempt && !achieved ? 'achievement-card--attempted' : ''}`}
      onClick={onClick}
      type="button"
    >
      <div
        className="achievement-card__badge"
        style={{
          backgroundColor: achieved ? definition.color : undefined,
          borderColor: achieved ? definition.color : undefined,
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
