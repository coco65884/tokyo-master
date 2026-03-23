#!/usr/bin/env python3
"""
rail_lines.geojson の連続性を改善する。

既存のセグメントはすべてそのまま保持し、
隣接セグメント間の小さなギャップのみ直線で補完する。

- セグメントの削除・並べ替えは行わない
- 連続性チェック: 隣接セグメントの端点間距離を計測
- 閾値以下のギャップに直線接続セグメントを挿入
"""

import json
import math
import os
import shutil

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data")

# この距離(m)以下のギャップを直線で補完する
GAP_FILL_THRESHOLD_M = 500


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def fill_gaps(segments: list[list]) -> list[list]:
    """
    隣接セグメント間の小さなギャップを直線で補完する。
    セグメントの順序・内容は変更しない。
    """
    if len(segments) < 2:
        return segments

    result = [segments[0]]
    for i in range(1, len(segments)):
        prev_end = result[-1][-1]
        curr_start = segments[i][0]
        gap = haversine_m(prev_end[1], prev_end[0], curr_start[1], curr_start[0])

        if 1 < gap <= GAP_FILL_THRESHOLD_M:
            # 小さなギャップ → 直線で接続
            result.append([prev_end, curr_start])

        result.append(segments[i])

    return result


def main() -> None:
    geojson_path = os.path.join(DATA_DIR, "geojson", "rail_lines.geojson")

    with open(geojson_path, encoding="utf-8") as f:
        geo = json.load(f)

    filled_count = 0
    total_fills = 0

    for feat in geo["features"]:
        geom = feat["geometry"]
        name = feat["properties"]["name"]

        if geom["type"] != "MultiLineString":
            continue

        original_segs = geom["coordinates"]
        new_segs = fill_gaps(original_segs)

        added = len(new_segs) - len(original_segs)
        if added > 0:
            filled_count += 1
            total_fills += added
            print(f"  {name}: {added} gaps filled")
            geom["coordinates"] = new_segs

    print(f"\nFilled {total_fills} gaps in {filled_count} features")

    # 保存
    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Saved: {geojson_path}")

    pub = os.path.join(PUBLIC_DIR, "geojson", "rail_lines.geojson")
    shutil.copy(geojson_path, pub)
    print(f"Copied: {pub}")


if __name__ == "__main__":
    main()
