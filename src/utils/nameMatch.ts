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

/**
 * ユーザーの入力が正解の名前文字列と一致するかチェックする。
 * NameVariants を持たないデータ（line_index の station.name など）用。
 * 完全一致のほか、「駅」サフィックスの有無を吸収する。
 */
export function matchesNameString(input: string, correctName: string): boolean {
  const normalized = input.trim().toLowerCase();
  const target = correctName.trim().toLowerCase();
  if (!normalized || !target) return false;

  if (normalized === target) return true;

  // 「駅」サフィックスの有無を吸収
  const withoutEki = (s: string) => (s.endsWith('駅') ? s.slice(0, -1) : s);
  if (withoutEki(normalized) === withoutEki(target)) return true;

  return false;
}
