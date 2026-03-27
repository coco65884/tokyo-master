import type { QuizQuestion, QuizChoice } from '@/types';
import { loadLineIndex } from '@/utils/dataLoader';
import genrePois from '@/data/genre_pois.json';
import riversData from '@/data/rivers.json';
import roadsData from '@/data/roads.json';

/** 全駅プール（遅延ロード・キャッシュ） */
interface StationPoolEntry {
  name: string;
  lat: number;
  lng: number;
  lineKeys: string[];
}

let stationPoolCache: StationPoolEntry[] | null = null;

/** 全駅プールを構築する */
async function getStationPool(): Promise<StationPoolEntry[]> {
  if (stationPoolCache) return stationPoolCache;

  const { lines } = await loadLineIndex();
  const map = new Map<string, StationPoolEntry>();

  for (const line of lines) {
    for (const station of line.stations) {
      const rawName = station.name.endsWith('駅') ? station.name.slice(0, -1) : station.name;
      const existing = map.get(rawName);
      if (existing) {
        if (!existing.lineKeys.includes(line.key)) {
          existing.lineKeys.push(line.key);
        }
      } else {
        map.set(rawName, {
          name: rawName,
          lat: station.lat,
          lng: station.lng,
          lineKeys: [line.key],
        });
      }
    }
  }

  stationPoolCache = Array.from(map.values());
  return stationPoolCache;
}

/** 2点間の距離の二乗（ソート用、正確な距離計算は不要） */
function distSq(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = lat2 - lat1;
  const dLng = (lng2 - lng1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  return dLat * dLat + dLng * dLng;
}

/** 配列をシャッフルする（Fisher-Yates） */
function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 駅名ディストラクターを生成する。
 * 正解駅の近隣15〜30駅から3つを選出（同路線の駅は除外）。
 */
async function generateStationDistractors(
  question: QuizQuestion,
  excludeLineKey?: string,
  excludeNames?: Set<string>,
): Promise<string[]> {
  const pool = await getStationPool();
  const correctName = question.targetName.kanji;
  const lat = question.lat ?? 0;
  const lng = question.lng ?? 0;

  // 正解と同名、同路線の駅を除外し、距離でソート
  const candidates = pool
    .filter((s) => {
      if (s.name === correctName) return false;
      if (excludeNames?.has(s.name)) return false;
      if (excludeLineKey && s.lineKeys.includes(excludeLineKey)) return false;
      return true;
    })
    .map((s) => ({ name: s.name, dist: distSq(lat, lng, s.lat, s.lng) }))
    .sort((a, b) => a.dist - b.dist);

  // 近隣15〜30駅から3つ選出
  const nearbyCount = Math.min(30, Math.max(15, candidates.length));
  const nearby = candidates.slice(0, nearbyCount);
  const selected = shuffle(nearby).slice(0, 3);

  // プール不足時のフォールバック
  while (selected.length < 3 && candidates.length > selected.length) {
    const next = candidates[selected.length];
    if (!selected.some((s) => s.name === next.name)) {
      selected.push(next);
    }
  }

  return selected.map((s) => s.name);
}

/** genre_pois.json からカテゴリ別の名前プールを構築（キャッシュ） */
const categoryPoolCache = new Map<string, string[]>();

function getCategoryPool(category: string): string[] {
  if (categoryPoolCache.has(category)) return categoryPoolCache.get(category)!;

  let names: string[] = [];

  if (category === 'rivers') {
    // 川: rivers.json から取得（「川」サフィックスを除去して比較用）
    const rivers = riversData as Array<{ name: { kanji: string } }>;
    names = rivers.map((r) => {
      const k = r.name.kanji;
      return k.endsWith('川') ? k.slice(0, -1) : k;
    });
  } else if (category === 'roads') {
    // 道路: roads.json から取得（サフィックス除去）
    const roads = roadsData as Array<{ name: { kanji: string } }>;
    names = roads.map((r) => {
      const k = r.name.kanji;
      for (const suffix of ['通り', '街道', '道路', '道']) {
        if (k.endsWith(suffix)) return k.slice(0, -suffix.length);
      }
      return k;
    });
  } else {
    // genre_pois.json から取得
    const typedPois = genrePois as Record<string, { pois: Array<{ name: string }> }>;
    const entry = typedPois[category];
    names = entry ? entry.pois.map((p) => p.name) : [];
  }

  const unique = [...new Set(names)];
  categoryPoolCache.set(category, unique);
  return unique;
}

/**
 * 同カテゴリの問題プールからディストラクターを生成する。
 * 出題リスト内で不足する場合は genre_pois.json の全データからフォールバック。
 */
function generateSameCategoryDistractors(
  question: QuizQuestion,
  allQuestions: QuizQuestion[],
  count: number = 3,
): string[] {
  const correctName = question.targetName.kanji;

  // まず出題リスト内の同カテゴリから探す
  const fromQuestions = allQuestions
    .filter((q) => q.category === question.category && q.targetName.kanji !== correctName)
    .map((q) => q.targetName.kanji);
  let unique = [...new Set(fromQuestions)];

  // 不足する場合は genre_pois.json の全データからフォールバック
  if (unique.length < count && question.category) {
    const pool = getCategoryPool(question.category);
    const extras = pool.filter((name) => name !== correctName && !unique.includes(name));
    unique = [...unique, ...extras];
  }

  return shuffle(unique).slice(0, count);
}

/**
 * QuizQuestion に4択の選択肢を生成して付与する。
 * 駅カテゴリ: 近隣駅からディストラクター生成。
 * その他カテゴリ: 同カテゴリの他の問題からディストラクター生成。
 */
export async function generateChoicesForQuestions(
  questions: QuizQuestion[],
  options?: { excludeLineKey?: string },
): Promise<QuizQuestion[]> {
  const allCorrectNames = new Set(questions.map((q) => q.targetName.kanji));

  const result: QuizQuestion[] = [];
  for (const q of questions) {
    let distractors: string[];

    if (q.category === 'stations') {
      distractors = await generateStationDistractors(q, options?.excludeLineKey, allCorrectNames);
    } else {
      distractors = generateSameCategoryDistractors(q, questions);
    }

    if (distractors.length === 0) {
      result.push(q);
      continue;
    }

    const correctChoice: QuizChoice = {
      id: `${q.id}-correct`,
      label: q.targetName.kanji,
      isCorrect: true,
    };
    const distractorChoices: QuizChoice[] = distractors.map((name, i) => ({
      id: `${q.id}-d${i}`,
      label: name,
      isCorrect: false,
    }));
    const choices = shuffle([correctChoice, ...distractorChoices]);
    result.push({ ...q, choices });
  }

  return result;
}
