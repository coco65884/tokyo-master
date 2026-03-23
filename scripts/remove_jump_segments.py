#!/usr/bin/env python3
"""
rail_lines.geojson から不正な直線ジャンプセグメントを除去する。

OSMデータの加工時に生じた2座標の直線セグメント（駅間をワープする線）を検出・除去。
判定基準:
- 2座標のセグメントで500m超の長さ → 直線ジャンプと判断して除去
- 3-5座標のセグメントで平均ステップが1km超 → 同様に除去
"""

import json
import math
import os
import shutil

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data")

# 2座標セグメントの除去閾値(m)
TWO_COORD_THRESHOLD_M = 500
# 3-5座標セグメントの平均ステップ除去閾値(m)
SHORT_SEG_AVG_STEP_THRESHOLD_M = 1000


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


def is_jump_segment(coords: list) -> bool:
    """直線ジャンプセグメントかどうかを判定"""
    n = len(coords)
    if n < 2:
        return True  # 無効なセグメント

    length = segment_length(coords)

    if n == 2:
        return length > TWO_COORD_THRESHOLD_M
    elif n <= 5:
        avg_step = length / (n - 1)
        return avg_step > SHORT_SEG_AVG_STEP_THRESHOLD_M

    return False


def main() -> None:
    geojson_path = os.path.join(DATA_DIR, "geojson", "rail_lines.geojson")

    with open(geojson_path, encoding="utf-8") as f:
        geo = json.load(f)

    total_removed = 0
    features_affected = 0

    for feat in geo["features"]:
        geom = feat["geometry"]
        name = feat["properties"]["name"]

        if geom["type"] == "LineString":
            # 単一のLineStringは基本的に除去しない（メインのジオメトリ）
            continue

        if geom["type"] != "MultiLineString":
            continue

        original_count = len(geom["coordinates"])
        kept = []
        removed_here = 0

        for seg in geom["coordinates"]:
            if is_jump_segment(seg):
                removed_here += 1
                length = segment_length(seg)
                if length > 5000:  # 5km超のジャンプのみログ
                    print(f"  Removed: {name} ({len(seg)} coords, {length:.0f}m)")
            else:
                kept.append(seg)

        if removed_here > 0:
            total_removed += removed_here
            features_affected += 1

            if len(kept) == 0:
                # 全セグメント除去 → 空にはできないので最長のセグメントを残す
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
