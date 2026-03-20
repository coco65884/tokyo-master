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

  return line.stations.map((station, idx) => {
    // 駅名から「駅」サフィックスを除去（末尾に「駅」がある場合）
    const rawName = station.name;
    const answerName = rawName.endsWith('駅') ? rawName.slice(0, -1) : rawName;

    return {
      id: `line-q-${idx}`,
      targetName: {
        kanji: answerName,
        hiragana: '',
        katakana: '',
        romaji: '',
      },
      lat: station.lat,
      lng: station.lng,
      hint: `${idx + 1}番目の駅`,
      category: 'stations' as const,
      suffix: '駅',
    };
  });
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

  // 駅名クイズ（サフィックス「駅」付き）
  for (const [name, st] of stationMap) {
    const answerName = name.endsWith('駅') ? name.slice(0, -1) : name;
    questions.push({
      id: `ward-station-${idx++}`,
      targetName: { kanji: answerName, hiragana: '', katakana: '', romaji: '' },
      lat: st.lat,
      lng: st.lng,
      category: 'stations',
      suffix: '駅',
    });
  }

  // 河川クイズ（サフィックス「川」付き）
  for (const riverName of wardObj.riverNames) {
    const answerName = riverName.endsWith('川') ? riverName.slice(0, -1) : riverName;
    questions.push({
      id: `ward-river-${idx++}`,
      targetName: { kanji: answerName, hiragana: '', katakana: '', romaji: '' },
      category: 'rivers',
      suffix: '川',
    });
  }

  return questions;
}

/**
 * テーマクイズ（河川）用の問題を生成する
 */
export function generateRiverQuiz(): QuizQuestion[] {
  const rivers = riversData as RiverMeta[];
  return rivers.map((river, idx) => {
    // 河川名から「川」サフィックスを除去（末尾に「川」がある場合）
    const rawKanji = river.name.kanji;
    const answerKanji = rawKanji.endsWith('川') ? rawKanji.slice(0, -1) : rawKanji;
    // ひらがな・カタカナ・ローマ字も同様に除去
    const rawHira = river.name.hiragana;
    const answerHira = rawHira.endsWith('がわ')
      ? rawHira.slice(0, -2)
      : rawHira.endsWith('かわ')
        ? rawHira.slice(0, -2)
        : rawHira;
    const rawKata = river.name.katakana;
    const answerKata = rawKata.endsWith('ガワ')
      ? rawKata.slice(0, -2)
      : rawKata.endsWith('カワ')
        ? rawKata.slice(0, -2)
        : rawKata;
    const rawRomaji = river.name.romaji;
    const answerRomaji = rawRomaji.toLowerCase().endsWith('gawa')
      ? rawRomaji.slice(0, -4)
      : rawRomaji.toLowerCase().endsWith('kawa')
        ? rawRomaji.slice(0, -4)
        : rawRomaji;

    return {
      id: `river-q-${idx}`,
      targetName: {
        kanji: answerKanji,
        hiragana: answerHira,
        katakana: answerKata,
        romaji: answerRomaji,
      },
      category: 'rivers' as const,
      suffix: '川',
    };
  });
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
    // groupがある場合はユニークグループ数をカウント
    const hasGroups = entry.pois.some((poi) => poi.group);
    let count: number;
    if (hasGroups) {
      const uniqueGroups = new Set(entry.pois.map((poi) => poi.group || poi.name));
      count = uniqueGroups.size;
    } else {
      count = entry.pois.length;
    }
    result.push({
      key,
      label: entry.label,
      icon: entry.icon,
      count,
    });
  }

  return result;
}

/** ジャンルごとのサフィックス設定 */
const GENRE_SUFFIX: Record<string, { suffix: string; strip: boolean }> = {
  universities: { suffix: '大学', strip: true },
  high_schools: { suffix: '高校', strip: true },
  jiro: { suffix: '店', strip: false },
};

/**
 * ジャンルPOIクイズ用の問題を生成する
 * groupフィールドがある場合は同じgroupを1つの問題に統合し、追加座標をextraLocationsに格納
 * サフィックスがある場合は正解名から除去し、suffix フィールドに設定
 */
export function generateGenreQuiz(genreKey: string): QuizQuestion[] {
  const entry = typedGenrePois[genreKey];
  if (!entry) return [];

  const suffixConfig = GENRE_SUFFIX[genreKey];

  // groupフィールドを持つエントリがあるか判定
  const hasGroups = entry.pois.some((poi) => poi.group);

  if (hasGroups) {
    // グループ統合モード: 同じgroupを1つの問題にまとめる
    const groupMap = new Map<
      string,
      { first: GenrePoi; extras: { lat: number; lng: number; name?: string }[] }
    >();
    const groupOrder: string[] = [];

    for (const poi of entry.pois) {
      const group = poi.group || poi.name;
      if (!groupMap.has(group)) {
        groupMap.set(group, { first: poi, extras: [] });
        groupOrder.push(group);
      } else {
        groupMap.get(group)!.extras.push({ lat: poi.lat, lng: poi.lng, name: poi.name });
      }
    }

    return groupOrder.map((group, idx) => {
      const { first, extras } = groupMap.get(group)!;

      // サフィックス処理: 正解名から末尾のサフィックスを除去
      let answerName = group;
      let suffix: string | undefined;
      if (suffixConfig) {
        suffix = suffixConfig.suffix;
        if (suffixConfig.strip && answerName.endsWith(suffixConfig.suffix)) {
          answerName = answerName.slice(0, -suffixConfig.suffix.length);
        }
      }

      return {
        id: `genre-${genreKey}-q-${idx}`,
        targetName: {
          kanji: answerName,
          hiragana: '',
          katakana: '',
          romaji: '',
        },
        lat: first.lat,
        lng: first.lng,
        hint: `${idx + 1}番`,
        category: genreKey as ThemeType,
        suffix,
        group,
        extraLocations: extras.length > 0 ? extras : undefined,
        poiDisplayName: first.name,
      };
    });
  }

  // 非グループモード（従来動作）
  return entry.pois.map((poi, idx) => {
    // サフィックス処理: 正解名から末尾のサフィックスを除去
    let answerName = poi.name;
    let suffix: string | undefined;
    if (suffixConfig) {
      suffix = suffixConfig.suffix;
      if (suffixConfig.strip && answerName.endsWith(suffixConfig.suffix)) {
        answerName = answerName.slice(0, -suffixConfig.suffix.length);
      }
    }

    return {
      id: `genre-${genreKey}-q-${idx}`,
      targetName: {
        kanji: answerName,
        hiragana: '',
        katakana: '',
        romaji: '',
      },
      lat: poi.lat,
      lng: poi.lng,
      hint: `${idx + 1}番`,
      category: genreKey as ThemeType,
      suffix,
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
