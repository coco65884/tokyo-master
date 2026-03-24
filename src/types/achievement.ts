import type { QuizScopeType } from './quiz';

/** Achievement定義 */
export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  scopeType: QuizScopeType;
  scopeId: string;
  /** 路線カラー（Badge表示用） */
  color: string;
  icon: string;
  /** 難易度ランク（銅=kantan, 銀=futsuu, 金=muzukashii） */
  difficulty?: 'kantan' | 'futsuu' | 'muzukashii';
}

/** ユーザーの達成状況 */
export interface UserAchievement {
  achievementId: string;
  achieved: boolean;
  bestAccuracy: number;
  achievedAt?: string;
  attempts: number;
}
