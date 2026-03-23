#!/usr/bin/env python3
"""
rail_lines.geojson の連続性を改善する。

既存のセグメントはすべてそのまま保持し、
隣接セグメント間のギャップをセグメント端点同士の直線で補完する。

- セグメントの削除は行わない
- 連続性チェック: 隣接セグメントの端点間距離を計測
- セグメント-to-セグメント接続: 4つの端点組み合わせから最短を選択
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


def coord_dist(c1: list, c2: list) -> float:
    return haversine_m(c1[1], c1[0], c2[1], c2[0])


def fill_gaps(segments: list[list]) -> list[list]:
    """
    隣接セグメント間のギャップをセグメント端点同士で補完する。

    各ギャップについて、前セグメントの末尾と次セグメントの先頭の
    4つの端点組み合わせから最短距離のペアを選んで接続。
    必要に応じてセグメントを反転させる。
    """
    if len(segments) < 2:
        return segments

    result = [list(segments[0])]
    for i in range(1, len(segments)):
        prev = result[-1]
        curr = list(segments[i])

        # 4つの端点組み合わせの距離を計算
        candidates = [
            (coord_dist(prev[-1], curr[0]), False, False),   # prev_end -> curr_start
            (coord_dist(prev[-1], curr[-1]), False, True),    # prev_end -> curr_end (reverse curr)
            (coord_dist(prev[0], curr[0]), True, False),      # prev_start -> curr_start (reverse prev)
            (coord_dist(prev[0], curr[-1]), True, True),      # prev_start -> curr_end (reverse both)
        ]
        best_dist, reverse_prev, reverse_curr = min(candidates, key=lambda x: x[0])

        if reverse_prev:
            result[-1] = list(reversed(result[-1]))
        if reverse_curr:
            curr = list(reversed(curr))

        prev = result[-1]

        if best_dist <= GAP_FILL_THRESHOLD_M and best_dist > 1:
            # ギャップを直線で接続
            result.append([prev[-1], curr[0]])

        result.append(curr)

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
