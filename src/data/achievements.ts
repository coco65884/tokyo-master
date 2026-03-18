import type { AchievementDefinition } from '@/types';
import type { LineIndexEntry } from '@/types';
import wardsData from '@/data/wards.json';
import riversData from '@/data/rivers.json';

interface WardMeta {
  id: string;
  name: { kanji: string; hiragana: string; katakana: string; romaji: string };
  type: string;
}

interface RiverMeta {
  id: string;
  name: { kanji: string; hiragana: string; katakana: string; romaji: string };
}

/** 区のデフォルトカラー */
const WARD_COLOR = '#6366f1';

/** 河川テーマカラー */
const RIVER_COLOR = '#0ea5e9';

/**
 * 路線データから路線アチーブメント定義を生成する。
 * line_index.json は fetch 経由のためラインアチーブメントは非同期で取得する。
 */
export function generateLineAchievements(lines: LineIndexEntry[]): AchievementDefinition[] {
  return lines.map((line) => ({
    id: `line:${line.key}`,
    title: `${line.name}マスター`,
    description: `${line.name}の全駅を正解する`,
    scopeType: 'line' as const,
    scopeId: line.key,
    color: line.color,
    icon: line.abbr || line.name.charAt(0),
  }));
}

/**
 * 区・市アチーブメント定義を生成する（同期、JSON importから）
 */
export function generateWardAchievements(): AchievementDefinition[] {
  const wards = wardsData as WardMeta[];
  return wards.map((ward) => ({
    id: `ward:${ward.id}`,
    title: `${ward.name.kanji}マスター`,
    description: `${ward.name.kanji}の全問を正解する`,
    scopeType: 'ward' as const,
    scopeId: ward.id,
    color: WARD_COLOR,
    icon: ward.name.kanji.replace(/[区市町村]$/, '').charAt(0),
  }));
}

/**
 * 河川テーマアチーブメント定義を生成する（同期）
 */
export function generateRiverAchievement(): AchievementDefinition {
  const rivers = riversData as RiverMeta[];
  return {
    id: 'theme:rivers',
    title: '東京の川マスター',
    description: `東京の河川（${rivers.length}本）を全て正解する`,
    scopeType: 'theme' as const,
    scopeId: 'rivers',
    color: RIVER_COLOR,
    icon: '川',
  };
}

/**
 * 全アチーブメント定義を取得する（路線データは非同期）
 */
export async function loadAllAchievements(
  lines: LineIndexEntry[],
): Promise<AchievementDefinition[]> {
  const lineAchievements = generateLineAchievements(lines);
  const wardAchievements = generateWardAchievements();
  const riverAchievement = generateRiverAchievement();

  return [...lineAchievements, ...wardAchievements, riverAchievement];
}

/**
 * scopeType + scopeId からアチーブメント ID を導出するユーティリティ
 */
export function getAchievementId(scopeType: string, scopeId: string): string {
  return `${scopeType}:${scopeId}`;
}
