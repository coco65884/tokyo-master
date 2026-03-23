#!/usr/bin/env python3
"""
rail_lines.geojson から不正な直線ジャンプセグメントを除去する。

OSMデータの加工時に生じた短い直線セグメントのうち、路線の駅間接続ではない
不正なワープを検出・除去。

判定基準:
- 短セグメント(2-5座標)で、かつ
- 端点が路線の駅から離れている(駅間接続ではない)場合のみ除去
- 端点が駅に近い場合は正当な駅間接続として保持
"""

import json
import math
import os
import shutil

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data")

# セグメントの端点が駅からこの距離(m)以内なら「駅に近い」と判定
STATION_PROXIMITY_M = 500
# 短セグメントの最小長(m)。これ未満は除去対象にしない
MIN_SUSPICIOUS_LENGTH_M = 500


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def segment_length(coords: list) -> float:
    total = 0.0
    for i in range(1, len(coords)):
        total += haversine_m(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0])
    return total


def nearest_station_dist(coord: list, stations: list[dict]) -> float:
    """座標[lng, lat]から最も近い駅までの距離(m)を返す"""
    if not stations:
        return float("inf")
    return min(haversine_m(coord[1], coord[0], st["lat"], st["lng"]) for st in stations)


def is_orphan_jump(coords: list, stations: list[dict]) -> bool:
    """
    駅間接続ではない不正ジャンプかどうかを判定。

    - 短セグメント(<=5座標)で500m超の長さ
    - かつ、端点の少なくとも片方が駅から遠い場合 → 不正ジャンプ
    """
    n = len(coords)
    if n < 2 or n > 5:
        return False

    length = segment_length(coords)
    if length < MIN_SUSPICIOUS_LENGTH_M:
        return False

    # 端点が駅に近いか確認
    start_near = nearest_station_dist(coords[0], stations) < STATION_PROXIMITY_M
    end_near = nearest_station_dist(coords[-1], stations) < STATION_PROXIMITY_M

    # 両端が駅に近い → 正当な駅間接続。保持する
    if start_near and end_near:
        return False

    # 少なくとも片方が駅から遠い → 不正ジャンプ
    return True


def main() -> None:
    geojson_path = os.path.join(DATA_DIR, "geojson", "rail_lines.geojson")
    index_path = os.path.join(DATA_DIR, "lines", "line_index.json")

    with open(geojson_path, encoding="utf-8") as f:
        geo = json.load(f)
    with open(index_path, encoding="utf-8") as f:
        index = json.load(f)

    # lineId → 駅リストのマッピングを構築
    lid_to_stations: dict[str, list[dict]] = {}
    for line in index["lines"]:
        stations = line.get("stations", [])
        for lid in line.get("lineIds", []):
            lid_to_stations[lid] = stations

    total_removed = 0
    features_affected = 0

    for feat in geo["features"]:
        geom = feat["geometry"]
        fid = feat["properties"]["id"]
        name = feat["properties"]["name"]

        if geom["type"] != "MultiLineString":
            continue

        stations = lid_to_stations.get(fid, [])

        original_count = len(geom["coordinates"])
        kept = []
        removed_here = 0

        for seg in geom["coordinates"]:
            if is_orphan_jump(seg, stations):
                removed_here += 1
                length = segment_length(seg)
                print(f"  Removed: {name} ({len(seg)} coords, {length:.0f}m)")
            else:
                kept.append(seg)

        if removed_here > 0:
            total_removed += removed_here
            features_affected += 1

            if len(kept) == 0:
                longest = max(geom["coordinates"], key=lambda s: segment_length(s))
                kept = [longest]
                total_removed -= 1
                print(f"  Warning: {name} - kept longest segment to avoid empty geometry")

            if len(kept) == 1:
                geom["type"] = "LineString"
                geom["coordinates"] = kept[0]
            else:
                geom["coordinates"] = kept

    print(f"\nRemoved {total_removed} jump segments from {features_affected} features")

    # 保存
    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Saved: {geojson_path}")

    pub = os.path.join(PUBLIC_DIR, "geojson", "rail_lines.geojson")
    shutil.copy(geojson_path, pub)
    print(f"Copied: {pub}")


if __name__ == "__main__":
    main()
