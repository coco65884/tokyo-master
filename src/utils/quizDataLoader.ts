import type { QuizQuestion, ThemeType } from '@/types';
import { loadLineIndex, loadWardObjects, loadWardCenters } from '@/utils/dataLoader';
import type { WardCenter, WardObjects } from '@/utils/dataLoader';
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

/**
 * 路線クイズ用の問題を生成する。
 * 各駅を1つの問題として、始発→終点の順で返す。
 */
export async function generateLineQuiz(lineKey: string): Promise<QuizQuestion[]> {
  const { lines } = await loadLineIndex();
  const line = lines.find((l) => l.key === lineKey);
  if (!line) return [];

  return line.stations.map((station, idx) => ({
    id: `line-q-${idx}`,
    targetName: {
      kanji: station.name,
      hiragana: '',
      katakana: '',
      romaji: '',
    },
    lat: station.lat,
    lng: station.lng,
    hint: `${idx + 1}番目の駅`,
    category: 'stations' as const,
  }));
}

/**
 * 区クイズ用の問題を生成する。
 * その区を通る路線の駅名を問う。
 */
export async function generateWardQuiz(wardId: string): Promise<QuizQuestion[]> {
  const [wardObjects, { lines }] = await Promise.all([loadWardObjects(), loadLineIndex()]);

  const wardObj: WardObjects | undefined = wardObjects[wardId];
  if (!wardObj) return [];

  // 区を通る路線のキーからその路線の駅を集める
  const stationMap = new Map<string, { name: string; lat: number; lng: number }>();

  for (const lineKey of wardObj.lineKeys) {
    const line = lines.find((l) => l.key === lineKey);
    if (!line) continue;
    for (const station of line.stations) {
      // 重複回避（同じ駅名は1つに）
      if (!stationMap.has(station.name)) {
        stationMap.set(station.name, station);
      }
    }
  }

  const questions: QuizQuestion[] = [];
  let idx = 0;

  // 駅名クイズ
  for (const [name, st] of stationMap) {
    questions.push({
      id: `ward-station-${idx++}`,
      targetName: { kanji: name, hiragana: '', katakana: '', romaji: '' },
      lat: st.lat,
      lng: st.lng,
      category: 'stations',
    });
  }

  // 河川クイズ
  for (const riverName of wardObj.riverNames) {
    questions.push({
      id: `ward-river-${idx++}`,
      targetName: { kanji: riverName, hiragana: '', katakana: '', romaji: '' },
      category: 'rivers',
    });
  }

  return questions;
}

/**
 * テーマクイズ（河川）用の問題を生成する
 */
export function generateRiverQuiz(): QuizQuestion[] {
  const rivers = riversData as RiverMeta[];
  return rivers.map((river, idx) => ({
    id: `river-q-${idx}`,
    targetName: {
      kanji: river.name.kanji,
      hiragana: river.name.hiragana,
      katakana: river.name.katakana,
      romaji: river.name.romaji,
    },
    category: 'rivers' as const,
  }));
}

/** ジャンルPOIデータの型 */
interface GenrePoi {
  name: string;
  lat: number;
  lng: number;
  group?: string;
}

interface GenreEntry {
  label: string;
  icon: string;
  pois: GenrePoi[];
}

type GenrePoisData = Record<string, GenreEntry>;

const typedGenrePois = genrePois as GenrePoisData;

/**
 * ジャンル一覧を取得する（河川 + genre_pois.json の全ジャンル）
 */
export function getGenreList(): { key: string; label: string; icon: string; count: number }[] {
  const rivers = riversData as RiverMeta[];
  const result: { key: string; label: string; icon: string; count: number }[] = [
    { key: 'rivers', label: '河川', icon: '🏞️', count: rivers.length },
  ];

  for (const [key, entry] of Object.entries(typedGenrePois)) {
    result.push({
      key,
      label: entry.label,
      icon: entry.icon,
      count: entry.pois.length,
    });
  }

  return result;
}

/**
 * ジャンルPOIクイズ用の問題を生成する
 * groupがある場合はgroup名を正解にし、同じgroupの番号を統一
 */
export function generateGenreQuiz(genreKey: string): QuizQuestion[] {
  const entry = typedGenrePois[genreKey];
  if (!entry) return [];

  // group → 番号マッピング（同じgroupは同じ番号）
  const groupNumbers = new Map<string, number>();
  let nextNum = 1;

  return entry.pois.map((poi, idx) => {
    const group = poi.group || poi.name;
    if (!groupNumbers.has(group)) {
      groupNumbers.set(group, nextNum++);
    }
    const num = groupNumbers.get(group)!;

    return {
      id: `genre-${genreKey}-q-${idx}`,
      targetName: {
        kanji: group,
        hiragana: '',
        katakana: '',
        romaji: '',
      },
      lat: poi.lat,
      lng: poi.lng,
      hint: `${num}番`,
      category: genreKey as ThemeType,
    };
  });
}

/**
 * ジャンルPOIデータを取得する（アイコン等のメタ情報付き）
 */
export function getGenreInfo(genreKey: string): GenreEntry | undefined {
  return typedGenrePois[genreKey];
}

/**
 * 路線一覧を取得する（事業者ごとにグループ化）
 */
export async function getOperatorLines(): Promise<{
  operators: string[];
  byOperator: Record<string, { key: string; name: string; stationCount: number; color: string }[]>;
}> {
  const { byOperator } = await loadLineIndex();
  const operators = Object.keys(byOperator);
  const result: Record<
    string,
    { key: string; name: string; stationCount: number; color: string }[]
  > = {};

  for (const op of operators) {
    result[op] = byOperator[op].map((l) => ({
      key: l.key,
      name: l.name,
      stationCount: l.stationCount,
      color: l.color,
    }));
  }

  return { operators, byOperator: result };
}

/**
 * 区一覧を取得する
 */
export function getWardList(): { id: string; name: string; type: string }[] {
  return (wardsData as WardMeta[])
    .map((w) => ({
      id: w.id,
      name: w.name.kanji,
      type: w.type,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

/**
 * 路線情報を取得する
 */
export async function getLineInfo(lineKey: string): Promise<LineIndexEntry | undefined> {
  const { lines } = await loadLineIndex();
  return lines.find((l) => l.key === lineKey);
}

/**
 * 区の中心座標を取得する
 */
export async function getWardCenter(wardId: string): Promise<WardCenter | undefined> {
  const centers = await loadWardCenters();
  return centers.find((w) => w.id === wardId);
}
