import type { AchievementDefinition } from '@/types';
import type { LineIndexEntry } from '@/types';
import wardsData from '@/data/wards.json';
import riversData from '@/data/rivers.json';
import genrePois from '@/data/genre_pois.json';

interface WardMeta {
  id: string;
  name: { kanji: string; hiragana: string; katakana: string; romaji: string };
  type: string;
}

interface RiverMeta {
  id: string;
  name: { kanji: string; hiragana: string; katakana: string; romaji: string };
}

/** ジャンルPOIデータの型 */
interface GenreEntry {
  label: string;
  icon: string;
  pois: { name: string; lat: number; lng: number }[];
}

type GenrePoisData = Record<string, GenreEntry>;

const typedGenrePois = genrePois as GenrePoisData;

/** ジャンル別テーマカラー */
const GENRE_COLORS: Record<string, string> = {
  universities: '#7c3aed',
  landmarks: '#dc2626',
  jiro: '#ea580c',
  museums: '#0891b2',
  parks: '#16a34a',
  stadiums: '#ca8a04',
  high_schools: '#2563eb',
};

/** 区のデフォルトカラー */
const WARD_COLOR = '#6366f1';

/** 河川テーマカラー */
const RIVER_COLOR = '#0ea5e9';

/**
 * 路線データから路線アチーブメント定義を生成する。
 * グリッド表示用の代表定義（difficultyなし）
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
 * ジャンルPOIテーマアチーブメント定義を生成する（同期）
 */
export function generateGenreAchievements(): AchievementDefinition[] {
  return Object.entries(typedGenrePois).map(([key, entry]) => ({
    id: getAchievementId('theme', key),
    title: `${entry.label}マスター`,
    description: `${entry.label}（${entry.pois.length}問）を全て正解する`,
    scopeType: 'theme' as const,
    scopeId: key,
    color: GENRE_COLORS[key] ?? '#6b7280',
    icon: entry.icon,
  }));
}

/** 白地図クイズカラー */
const BLANKMAP_COLOR = '#0d9488';

/**
 * 白地図クイズアチーブメント定義を生成する
 */
export function generateBlankMapAchievements(): AchievementDefinition[] {
  return [
    {
      id: getAchievementId('ward', 'blankmap-ku'),
      title: '白地図マスター（23区）',
      description: '白地図クイズで23区を全て正解する',
      scopeType: 'ward' as const,
      scopeId: 'blankmap-ku',
      color: BLANKMAP_COLOR,
      icon: '🗾',
    },
    {
      id: getAchievementId('ward', 'blankmap-city'),
      title: '白地図マスター（市含む）',
      description: '白地図クイズで東京全域（市含む）を全て正解する',
      scopeType: 'ward' as const,
      scopeId: 'blankmap-city',
      color: BLANKMAP_COLOR,
      icon: '🗾',
    },
    {
      id: getAchievementId('ward', 'blankmap-all'),
      title: '白地図マスター（全域）',
      description: '白地図クイズで東京都全部（島含む）を全て正解する',
      scopeType: 'ward' as const,
      scopeId: 'blankmap-all',
      color: BLANKMAP_COLOR,
      icon: '🗾',
    },
  ];
}

/**
 * 全アチーブメント定義を取得する（路線データは非同期）
 */
export async function loadAllAchievements(
  lines: LineIndexEntry[],
): Promise<AchievementDefinition[]> {
  const lineAchievements = generateLineAchievements(lines);
  const wardAchievements = generateWardAchievements();
  const blankMapAchievements = generateBlankMapAchievements();
  const riverAchievement = generateRiverAchievement();
  const genreAchievements = generateGenreAchievements();

  return [
    ...lineAchievements,
    ...wardAchievements,
    ...blankMapAchievements,
    riverAchievement,
    ...genreAchievements,
  ];
}

/**
 * scopeType + scopeId からアチーブメント ID を導出するユーティリティ
 */
export function getAchievementId(scopeType: string, scopeId: string): string {
  return `${scopeType}:${scopeId}`;
}
