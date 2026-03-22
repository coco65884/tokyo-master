import type { DifficultyLevel, DifficultySettings } from '@/types';

/** 難易度レベルから詳細設定を導出する */
export function getDifficultySettings(level: DifficultyLevel): DifficultySettings {
  switch (level) {
    case 'kantan':
      return {
        answerMode: 'multiple-choice',
        choiceCount: 4,
        showHints: true,
        showMapNumbers: true,
        showSuffix: true,
        revealOnCorrect: true,
        questionOrder: 'sequential',
      };
    case 'futsuu':
      return {
        answerMode: 'text',
        choiceCount: 0,
        showHints: true,
        showMapNumbers: true,
        showSuffix: true,
        revealOnCorrect: false,
        questionOrder: 'sequential',
      };
    case 'muzukashii':
      return {
        answerMode: 'text',
        choiceCount: 0,
        showHints: false,
        showMapNumbers: false,
        showSuffix: false,
        revealOnCorrect: false,
        questionOrder: 'shuffled',
      };
  }
}

/** 難易度レベルの日本語ラベル */
export const DIFFICULTY_LABELS: Record<DifficultyLevel, { name: string; desc: string }> = {
  kantan: { name: 'かんたん', desc: '4択' },
  futsuu: { name: 'ふつう', desc: '入力' },
  muzukashii: { name: 'むずかしい', desc: '入力(上級)' },
};
