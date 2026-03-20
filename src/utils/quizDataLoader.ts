import type { QuizQuestion, ThemeType } from '@/types';
import { loadLineIndex, loadWardObjects, loadWardCenters, loadWards } from '@/utils/dataLoader';
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

/** 道路名から共通サフィックスを除去する */
function stripRoadSuffix(name: string): { base: string; suffix: string } {
  // 長い順に試行（「街道」より先に「旧〜街道」はbaseが変わるだけなので順序は問題ない）
  const suffixes = ['通り', '街道', '道'];
  for (const s of suffixes) {
    if (name.endsWith(s)) {
      return { base: name.slice(0, -s.length), suffix: s };
    }
  }
  return { base: name, suffix: '' };
}

/** 区のバウンディングボックスを計算する */
interface WardBbox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

async function computeWardBbox(wardId: string): Promise<WardBbox | null> {
  const wardsGeo = await loadWards();
  const feature = wardsGeo.features.find((f) => f.properties?.id === wardId);
  if (!feature) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  function processCoords(coords: number[]) {
    const lng = coords[0];
    const lat = coords[1];
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  const geom = feature.geometry;
  if (geom.type === 'Polygon') {
    for (const ring of (geom as GeoJSON.Polygon).coordinates) {
      for (const coord of ring) {
        processCoords(coord);
      }
    }
  } else if (geom.type === 'MultiPolygon') {
    for (const polygon of (geom as GeoJSON.MultiPolygon).coordinates) {
      for (const ring of polygon) {
        for (const coord of ring) {
          processCoords(coord);
        }
      }
    }
  }

  if (!isFinite(minLat)) return null;

  // 少し余裕を持たせる（約200m）
  const padding = 0.002;
  return {
    minLat: minLat - padding,
    maxLat: maxLat + padding,
    minLng: minLng - padding,
    maxLng: maxLng + padding,
  };
}

/** POIが区のbbox内にあるか判定 */
function isInBbox(lat: number, lng: number, bbox: WardBbox): boolean {
  return lat >= bbox.minLat && lat <= bbox.maxLat && lng >= bbox.minLng && lng <= bbox.maxLng;
}

/**
 * 区クイズ用の問題を生成する。
 * 駅、河川、道路、大学、ランドマークを出題する。
 */
export async function generateWardQuiz(wardId: string): Promise<QuizQuestion[]> {
  const [wardObjects, { lines }, wardBbox] = await Promise.all([
    loadWardObjects(),
    loadLineIndex(),
    computeWardBbox(wardId),
  ]);

  const wardObj: WardObjects | undefined = wardObjects[wardId];
  if (!wardObj) return [];

  // 区を通る路線のキーからその路線の駅を集める
  const stationMap = new Map<string, { name: string; lat: number; lng: number }>();

  for (const lineKey of wardObj.lineKeys) {
    const line = lines.find((l) => l.key === lineKey);
    if (!line) continue;
    for (const station of line.stations) {
      // bbox内の駅のみ採用（区を通る路線でも区外の駅を除外）
      if (wardBbox && !isInBbox(station.lat, station.lng, wardBbox)) continue;
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

  // 道路クイズ（サフィックスを自動検出）
  for (const roadName of wardObj.roadNames) {
    const { base, suffix } = stripRoadSuffix(roadName);
    questions.push({
      id: `ward-road-${idx++}`,
      targetName: { kanji: base, hiragana: '', katakana: '', romaji: '' },
      category: 'roads',
      suffix: suffix || undefined,
    });
  }

  // 大学クイズ（genre_pois.json の universities から bbox内をフィルタ）
  if (wardBbox) {
    const uniEntry = typedGenrePois['universities'];
    if (uniEntry) {
      // グループ統合: 同じ大学のキャンパスが複数ある場合は1問にまとめる
      const groupMap = new Map<
        string,
        { first: GenrePoi; extras: { lat: number; lng: number; name?: string }[] }
      >();
      const groupOrder: string[] = [];

      for (const poi of uniEntry.pois) {
        if (!isInBbox(poi.lat, poi.lng, wardBbox)) continue;
        const group = poi.group || poi.name;
        if (!groupMap.has(group)) {
          groupMap.set(group, { first: poi, extras: [] });
          groupOrder.push(group);
        } else {
          groupMap.get(group)!.extras.push({ lat: poi.lat, lng: poi.lng, name: poi.name });
        }
      }

      for (const group of groupOrder) {
        const { first, extras } = groupMap.get(group)!;
        // 「大学」サフィックスを除去
        const answerName = group.endsWith('大学') ? group.slice(0, -2) : group;
        questions.push({
          id: `ward-uni-${idx++}`,
          targetName: { kanji: answerName, hiragana: '', katakana: '', romaji: '' },
          lat: first.lat,
          lng: first.lng,
          category: 'universities',
          suffix: '大学',
          group,
          extraLocations: extras.length > 0 ? extras : undefined,
          poiDisplayName: first.name,
        });
      }
    }
  }

  // ランドマーククイズ（genre_pois.json の landmarks から bbox内をフィルタ）
  if (wardBbox) {
    const lmEntry = typedGenrePois['landmarks'];
    if (lmEntry) {
      for (const poi of lmEntry.pois) {
        if (!isInBbox(poi.lat, poi.lng, wardBbox)) continue;
        questions.push({
          id: `ward-landmark-${idx++}`,
          targetName: { kanji: poi.name, hiragana: '', katakana: '', romaji: '' },
          lat: poi.lat,
          lng: poi.lng,
          category: 'landmarks',
        });
      }
    }
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
