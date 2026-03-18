import type { NameVariants } from './geography';

/** クイズの回答形式 */
export type AnswerMode = 'text' | 'drag-and-drop';

/** クイズの出題範囲タイプ */
export type QuizScopeType = 'ward' | 'line' | 'theme';

/** テーマタイプ（組み込みテーマ + ジャンルPOIキー） */
export type ThemeType =
  | 'rivers'
  | 'landmarks'
  | 'stations'
  | 'universities'
  | 'jiro'
  | 'museums'
  | 'parks'
  | 'stadiums'
  | 'high_schools';

/** クイズの設定 */
export interface QuizConfig {
  scopeType: QuizScopeType;
  scopeId: string;
  answerMode: AnswerMode;
  showHints: boolean;
}

/** クイズ問題 */
export interface QuizQuestion {
  id: string;
  targetName: NameVariants;
  lat?: number;
  lng?: number;
  hint?: string;
  category: ThemeType;
}

/** クイズ結果 */
export interface QuizResult {
  quizConfigId: string;
  scopeType: QuizScopeType;
  scopeId: string;
  totalQuestions: number;
  correctAnswers: number;
  accuracy: number;
  completedAt: string;
  answers: QuizAnswer[];
}

/** 個別の回答 */
export interface QuizAnswer {
  questionId: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
}
