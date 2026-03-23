#!/usr/bin/env python3
"""
各路線のGeoJSONジオメトリを始発駅〜終点駅の範囲にクリップする。

処理:
1. line_index.json から各路線の始発駅・終点駅の座標を取得
2. rail_lines.geojson の各featureについて、対応路線の端駅位置でクリップ
3. 端駅より外側に伸びているセグメントを除去
"""

import json
import math
import os
import shutil

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data")

# 端駅から最近接点までの許容距離(m)。これ以上離れていたらマッチしないと判断
STATION_MATCH_THRESHOLD_M = 2000


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def find_nearest_idx(coords: list, lat: float, lng: float) -> tuple[int, float]:
    """座標列の中で指定点に最も近い座標のインデックスと距離を返す"""
    best_idx = 0
    best_dist = float("inf")
    for i, c in enumerate(coords):
        d = haversine_m(c[1], c[0], lat, lng)
        if d < best_dist:
            best_dist = d
            best_idx = i
    return best_idx, best_dist


def clip_segment(
    coords: list, first_station: dict, last_station: dict
) -> list | None:
    """
    LineString座標列を始発駅〜終点駅の範囲にクリップ。
    始発駅・終点駅のいずれかに十分近い座標がなければNone（クリップ不要またはマッチしない）。
    """
    if len(coords) < 2:
        return coords

    idx_first, dist_first = find_nearest_idx(
        coords, first_station["lat"], first_station["lng"]
    )
    idx_last, dist_last = find_nearest_idx(
        coords, last_station["lat"], last_station["lng"]
    )

    # どちらの端駅もマッチしない → このセグメントは路線の範囲外か短すぎる
    first_matched = dist_first < STATION_MATCH_THRESHOLD_M
    last_matched = dist_last < STATION_MATCH_THRESHOLD_M

    if not first_matched and not last_matched:
        return coords  # マッチしないのでそのまま返す

    lo = 0
    hi = len(coords) - 1

    if first_matched and last_matched:
        lo = min(idx_first, idx_last)
        hi = max(idx_first, idx_last)
    elif first_matched:
        # 始発駅のみマッチ → 始発駅側をクリップ
        # idx_firstがセグメントの始点側か終点側かで判断
        if idx_first < len(coords) // 2:
            lo = idx_first
        else:
            hi = idx_first
    else:
        # 終点駅のみマッチ
        if idx_last < len(coords) // 2:
            lo = idx_last
        else:
            hi = idx_last

    if lo == 0 and hi == len(coords) - 1:
        return coords  # クリップ不要

    clipped = coords[lo : hi + 1]
    return clipped if len(clipped) >= 2 else coords


def main() -> None:
    index_path = os.path.join(DATA_DIR, "lines", "line_index.json")
    geojson_path = os.path.join(DATA_DIR, "geojson", "rail_lines.geojson")

    with open(index_path, encoding="utf-8") as f:
        index = json.load(f)
    with open(geojson_path, encoding="utf-8") as f:
        geo = json.load(f)

    feat_by_id = {f["properties"]["id"]: f for f in geo["features"]}

    # lineId → (first_station, last_station) のマッピングを構築
    lid_to_terminals: dict[str, tuple[dict, dict]] = {}
    for line in index["lines"]:
        stations = line.get("stations", [])
        if len(stations) < 2:
            continue
        for lid in line.get("lineIds", []):
            lid_to_terminals[lid] = (stations[0], stations[-1])

    clipped_count = 0
    total_removed_coords = 0

    for feat in geo["features"]:
        fid = feat["properties"]["id"]
        terminals = lid_to_terminals.get(fid)
        if not terminals:
            continue

        first_st, last_st = terminals
        geom = feat["geometry"]

        if geom["type"] == "LineString":
            original_len = len(geom["coordinates"])
            clipped = clip_segment(geom["coordinates"], first_st, last_st)
            if clipped and len(clipped) < original_len:
                removed = original_len - len(clipped)
                total_removed_coords += removed
                clipped_count += 1
                print(
                    f"  {feat['properties']['name']}: {original_len} -> {len(clipped)} coords "
                    f"(-{removed}, terminals: {first_st['name']}~{last_st['name']})"
                )
                geom["coordinates"] = clipped

        elif geom["type"] == "MultiLineString":
            new_segments = []
            for seg in geom["coordinates"]:
                original_len = len(seg)
                clipped = clip_segment(seg, first_st, last_st)
                if clipped:
                    if len(clipped) < original_len:
                        removed = original_len - len(clipped)
                        total_removed_coords += removed
                        clipped_count += 1
                        print(
                            f"  {feat['properties']['name']}: segment {original_len} -> {len(clipped)} coords "
                            f"(-{removed}, terminals: {first_st['name']}~{last_st['name']})"
                        )
                    new_segments.append(clipped)
                else:
                    new_segments.append(seg)

            if len(new_segments) == 1:
                geom["type"] = "LineString"
                geom["coordinates"] = new_segments[0]
            else:
                geom["coordinates"] = new_segments

    print(f"\nClipped {clipped_count} segments, removed {total_removed_coords} coordinates total")

    # 保存
    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Saved: {geojson_path}")

    pub = os.path.join(PUBLIC_DIR, "geojson", "rail_lines.geojson")
    shutil.copy(geojson_path, pub)
    print(f"Copied: {pub}")


if __name__ == "__main__":
    main()
