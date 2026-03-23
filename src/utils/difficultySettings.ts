import type { DifficultyLevel, DifficultySettings } from '@/types';

/** 難易度レベルから詳細設定を導出する */
export function getDifficultySettings(level: DifficultyLevel): DifficultySettings {
  switch (level) {
    case 'kantan':
      return {
        answerMode: 'multiple-choice',
        choiceCount: 4,
        showHints: true,
        showFirstChar: false,
        showMapNumbers: true,
        showSuffix: true,
        revealOnCorrect: true,
        questionOrder: 'sequential',
        timeLimitPerQuestion: 0,
      };
    case 'futsuu':
      return {
        answerMode: 'text',
        choiceCount: 0,
        showHints: true,
        showFirstChar: true,
        showMapNumbers: true,
        showSuffix: true,
        revealOnCorrect: false,
        questionOrder: 'sequential',
        timeLimitPerQuestion: 0,
      };
    case 'muzukashii':
      return {
        answerMode: 'text',
        choiceCount: 0,
        showHints: false,
        showFirstChar: false,
        showMapNumbers: false,
        showSuffix: false,
        revealOnCorrect: false,
        questionOrder: 'shuffled',
        timeLimitPerQuestion: 15,
      };
  }
}

/** 難易度レベルの日本語ラベル */
export const DIFFICULTY_LABELS: Record<DifficultyLevel, { name: string; desc: string }> = {
  kantan: { name: 'かんたん', desc: '4択' },
  futsuu: { name: 'ふつう', desc: '入力 + 頭文字ヒント' },
  muzukashii: { name: 'むずかしい', desc: '入力 + 制限時間15秒' },
};
