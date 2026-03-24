import type { AchievementDefinition } from '@/types';
import type { DifficultyLevel } from '@/types';
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

/** 難易度ラベル */
const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  kantan: 'かんたん',
  futsuu: 'ふつう',
  muzukashii: 'むずかしい',
};

const DIFFICULTIES: DifficultyLevel[] = ['kantan', 'futsuu', 'muzukashii'];

/**
 * 1つのベース定義から3難易度分のアチーブメントを生成する
 */
function expandByDifficulty(
  base: Omit<AchievementDefinition, 'id' | 'difficulty' | 'title' | 'description'> & {
    baseId: string;
    baseName: string;
    baseDesc: string;
  },
): AchievementDefinition[] {
  return DIFFICULTIES.map((diff) => ({
    id: `${base.baseId}:${diff}`,
    title: `${base.baseName}マスター（${DIFFICULTY_LABELS[diff]}）`,
    description: `${base.baseDesc}（${DIFFICULTY_LABELS[diff]}）`,
    scopeType: base.scopeType,
    scopeId: base.scopeId,
    color: base.color,
    icon: base.icon,
    difficulty: diff,
  }));
}

/**
 * 路線データから路線アチーブメント定義を生成する。
 */
export function generateLineAchievements(lines: LineIndexEntry[]): AchievementDefinition[] {
  return lines.flatMap((line) =>
    expandByDifficulty({
      baseId: `line:${line.key}`,
      baseName: line.name,
      baseDesc: `${line.name}の全駅を正解する`,
      scopeType: 'line',
      scopeId: line.key,
      color: line.color,
      icon: line.abbr || line.name.charAt(0),
    }),
  );
}

/**
 * 区・市アチーブメント定義を生成する（同期、JSON importから）
 */
export function generateWardAchievements(): AchievementDefinition[] {
  const wards = wardsData as WardMeta[];
  return wards.flatMap((ward) =>
    expandByDifficulty({
      baseId: `ward:${ward.id}`,
      baseName: ward.name.kanji,
      baseDesc: `${ward.name.kanji}の全問を正解する`,
      scopeType: 'ward',
      scopeId: ward.id,
      color: WARD_COLOR,
      icon: ward.name.kanji.replace(/[区市町村]$/, '').charAt(0),
    }),
  );
}

/**
 * 河川テーマアチーブメント定義を生成する（同期）
 */
export function generateRiverAchievement(): AchievementDefinition[] {
  const rivers = riversData as RiverMeta[];
  return expandByDifficulty({
    baseId: 'theme:rivers',
    baseName: '東京の川',
    baseDesc: `東京の河川（${rivers.length}本）を全て正解する`,
    scopeType: 'theme',
    scopeId: 'rivers',
    color: RIVER_COLOR,
    icon: '川',
  });
}

/**
 * ジャンルPOIテーマアチーブメント定義を生成する（同期）
 */
export function generateGenreAchievements(): AchievementDefinition[] {
  return Object.entries(typedGenrePois).flatMap(([key, entry]) =>
    expandByDifficulty({
      baseId: getAchievementId('theme', key),
      baseName: entry.label,
      baseDesc: `${entry.label}（${entry.pois.length}問）を全て正解する`,
      scopeType: 'theme',
      scopeId: key,
      color: GENRE_COLORS[key] ?? '#6b7280',
      icon: entry.icon,
    }),
  );
}

/**
 * 全アチーブメント定義を取得する（路線データは非同期）
 */
export async function loadAllAchievements(
  lines: LineIndexEntry[],
): Promise<AchievementDefinition[]> {
  const lineAchievements = generateLineAchievements(lines);
  const wardAchievements = generateWardAchievements();
  const riverAchievements = generateRiverAchievement();
  const genreAchievements = generateGenreAchievements();

  return [...lineAchievements, ...wardAchievements, ...riverAchievements, ...genreAchievements];
}

/**
 * scopeType + scopeId からアチーブメント ID を導出するユーティリティ
 */
export function getAchievementId(scopeType: string, scopeId: string): string {
  return `${scopeType}:${scopeId}`;
}
