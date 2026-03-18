import type { NameVariants } from '@/types';

/**
 * ユーザーの入力が正解の名前と一致するかチェックする（表記揺れ対応）
 * 漢字、ひらがな、カタカナ、ローマ字のいずれかに一致すればOK
 */
export function matchesName(input: string, name: NameVariants): boolean {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return false;

  return (
    normalized === name.kanji ||
    normalized === name.hiragana ||
    normalized === name.katakana.toLowerCase() ||
    normalized === name.romaji.toLowerCase()
  );
}
