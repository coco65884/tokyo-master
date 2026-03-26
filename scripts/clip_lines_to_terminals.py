#!/usr/bin/env python3
"""
各路線のGeoJSONジオメトリを始発駅〜終点駅の地理範囲にクリップする。

方式: 始発駅・終点駅の緯度経度範囲 + パディングを計算し、
範囲外の座標を除去する。セグメント単位の複雑なクリップではなく、
座標単位で範囲チェックすることで終端駅付近のジオメトリを確実に保持する。
"""

import json
import math
import os
import shutil

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data")

# 終端駅範囲のパディング（度）。約1km
PADDING_DEG = 0.01


def clip_coords_to_range(
    coords: list, lat_lo: float, lat_hi: float, lng_lo: float, lng_hi: float
) -> list[list]:
    """座標列を範囲内に限定。範囲外の座標で分割し、2座標以上の部分のみ返す。"""
    segments = []
    current = []

    for c in coords:
        if lat_lo <= c[1] <= lat_hi and lng_lo <= c[0] <= lng_hi:
            current.append(c)
        else:
            if len(current) >= 2:
                segments.append(current)
            current = []

    if len(current) >= 2:
        segments.append(current)

    return segments


def main() -> None:
    index_path = os.path.join(DATA_DIR, "lines", "line_index.json")
    geojson_path = os.path.join(DATA_DIR, "geojson", "rail_lines.geojson")

    with open(index_path, encoding="utf-8") as f:
        index = json.load(f)
    with open(geojson_path, encoding="utf-8") as f:
        geo = json.load(f)

    # lineId → (lat_lo, lat_hi, lng_lo, lng_hi) の範囲マッピング
    # 複数路線が同じ lineId を参照する場合、全駅を包含する範囲を使う
    lid_ranges: dict[str, tuple[float, float, float, float]] = {}

    for line in index["lines"]:
        stations = line.get("stations", [])
        if len(stations) < 2:
            continue

        lats = [s["lat"] for s in stations]
        lngs = [s["lng"] for s in stations]
        lat_lo = min(lats) - PADDING_DEG
        lat_hi = max(lats) + PADDING_DEG
        lng_lo = min(lngs) - PADDING_DEG
        lng_hi = max(lngs) + PADDING_DEG

        for lid in line.get("lineIds", []):
            if lid in lid_ranges:
                # 既存範囲と統合（広いほうを採用）
                old = lid_ranges[lid]
                lid_ranges[lid] = (
                    min(old[0], lat_lo),
                    max(old[1], lat_hi),
                    min(old[2], lng_lo),
                    max(old[3], lng_hi),
                )
            else:
                lid_ranges[lid] = (lat_lo, lat_hi, lng_lo, lng_hi)

    clipped_count = 0
    removed_coords = 0

    for feat in geo["features"]:
        fid = feat["properties"]["id"]
        if fid not in lid_ranges:
            continue

        lat_lo, lat_hi, lng_lo, lng_hi = lid_ranges[fid]
        geom = feat["geometry"]

        # 全座標を収集
        if geom["type"] == "LineString":
            all_segs = [geom["coordinates"]]
        elif geom["type"] == "MultiLineString":
            all_segs = geom["coordinates"]
        else:
            continue

        # 範囲外座標を除去
        original_count = sum(len(s) for s in all_segs)
        new_segs = []
        for seg in all_segs:
            clipped = clip_coords_to_range(seg, lat_lo, lat_hi, lng_lo, lng_hi)
            new_segs.extend(clipped)

        new_count = sum(len(s) for s in new_segs)

        if new_count < original_count and new_segs:
            removed = original_count - new_count
            removed_coords += removed
            clipped_count += 1

            if len(new_segs) == 1:
                geom["type"] = "LineString"
                geom["coordinates"] = new_segs[0]
            else:
                geom["type"] = "MultiLineString"
                geom["coordinates"] = new_segs

    print(f"Clipped {clipped_count} features, removed {removed_coords} coordinates")

    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Saved: {geojson_path}")

    pub = os.path.join(PUBLIC_DIR, "geojson", "rail_lines.geojson")
    shutil.copy(geojson_path, pub)
    print(f"Copied: {pub}")


if __name__ == "__main__":
    main()
