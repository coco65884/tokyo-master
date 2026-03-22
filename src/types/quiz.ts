import type { NameVariants } from './geography';

/** 難易度レベル */
export type DifficultyLevel = 'kantan' | 'futsuu' | 'muzukashii';

/** クイズの回答形式 */
export type AnswerMode = 'text' | 'multiple-choice' | 'drag-and-drop';

/** クイズの出題範囲タイプ */
export type QuizScopeType = 'ward' | 'line' | 'theme';

/** テーマタイプ（組み込みテーマ + ジャンルPOIキー） */
export type ThemeType =
  | 'rivers'
  | 'roads'
  | 'landmarks'
  | 'stations'
  | 'universities'
  | 'jiro'
  | 'museums'
  | 'parks'
  | 'stadiums'
  | 'high_schools';

/** 選択肢（4択モード用） */
export interface QuizChoice {
  id: string;
  label: string;
  isCorrect: boolean;
}

/** 難易度設定パラメータ */
export interface DifficultySettings {
  answerMode: AnswerMode;
  choiceCount: number;
  showHints: boolean;
  showMapNumbers: boolean;
  showSuffix: boolean;
  revealOnCorrect: boolean;
  questionOrder: 'sequential' | 'shuffled';
}

/** クイズの設定 */
export interface QuizConfig {
  scopeType: QuizScopeType;
  scopeId: string;
  difficulty: DifficultyLevel;
  /** @deprecated difficulty から導出される。後方互換性のため残す */
  answerMode?: AnswerMode;
  /** @deprecated difficulty から導出される。後方互換性のため残す */
  showHints?: boolean;
}

/** クイズ問題 */
export interface QuizQuestion {
  id: string;
  targetName: NameVariants;
  lat?: number;
  lng?: number;
  hint?: string;
  category: ThemeType;
  /** ジャンルクイズで入力欄の後に表示するサフィックス（例: "大学", "高校", "店"） */
  suffix?: string;
  /** グループ名（同じグループのPOIを視覚的に接続するために使用） */
  group?: string;
  /** 同一グループの追加キャンパス座標（統合後の追加ロケーション） */
  extraLocations?: { lat: number; lng: number; name?: string }[];
  /** メインマーカーの表示名（キャンパス名を含むフル名称） */
  poiDisplayName?: string;
  /** かんたんモード用の選択肢 */
  choices?: QuizChoice[];
}

/** クイズ結果 */
export interface QuizResult {
  quizConfigId: string;
  scopeType: QuizScopeType;
  scopeId: string;
  difficulty?: DifficultyLevel;
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
  selectedChoiceId?: string;
}
