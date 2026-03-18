import type {
  FeatureCollection,
  Point,
  LineString,
  MultiLineString,
  Polygon,
  MultiPolygon,
} from 'geojson';

/** 表記揺れ対応の名前辞書 */
export interface NameVariants {
  kanji: string;
  hiragana: string;
  katakana: string;
  romaji: string;
}

/** 駅データ */
export interface Station {
  id: string;
  name: NameVariants;
  lat: number;
  lng: number;
  lineIds: string[];
  wardId?: string;
  cityId?: string;
}

/** 路線データ */
export interface RailLine {
  id: string;
  name: NameVariants;
  operator: string;
  color: string;
  stationIds: string[];
}

/** 行政区域（区/市） */
export interface Ward {
  id: string;
  name: NameVariants;
  type: 'ku' | 'shi' | 'machi' | 'mura';
}

/** 河川データ */
export interface River {
  id: string;
  name: NameVariants;
}

/** 道路データ */
export interface Road {
  id: string;
  name: NameVariants;
}

/** 観光地データ */
export interface Landmark {
  id: string;
  name: NameVariants;
  lat: number;
  lng: number;
  description: string;
  wardId?: string;
}

/** レイヤー表示状態 */
export interface LayerVisibility {
  wards: boolean;
  prefBorders: boolean;
  railLines: Record<string, boolean>;
  rivers: boolean;
  roads: boolean;
  landmarks: boolean;
  stations: boolean;
}

/** GeoJSONデータ型 */
export type WardGeoJSON = FeatureCollection<Polygon | MultiPolygon>;
export type PrefBorderGeoJSON = FeatureCollection<LineString | MultiLineString>;
export type RailLineGeoJSON = FeatureCollection<LineString | MultiLineString>;
export type RiverGeoJSON = FeatureCollection<LineString | MultiLineString>;
export type RoadGeoJSON = FeatureCollection<LineString | MultiLineString>;
export type StationGeoJSON = FeatureCollection<Point>;
export type LandmarkGeoJSON = FeatureCollection<Point>;
