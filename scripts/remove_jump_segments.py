#!/usr/bin/env python3
"""
rail_lines.geojson の連続性改善と不要セグメント除去。

1. 2座標の直線セグメント（駅間を直線で結ぶアーティファクト）を除去
   - 500m以上の2座標セグメントは実際の線路ジオメトリではなく
     データ加工時の残留物のため除去
2. 隣接セグメント間のギャップをセグメント端点同士の直線で補完
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


def remove_straight_line_artifacts(segments: list[list]) -> list[list]:
    """
    2座標の直線セグメント（500m以上）のうち、同じエリアに
    詳細ジオメトリが既に存在するものだけを除去する。

    判定: 2座標セグメントの中点に対して、3座標以上のセグメントの
    座標が近くに存在すれば「カバー済み」とみなして除去する。
    """
    real_segs = [s for s in segments if len(s) >= 3]
    if not real_segs:
        return segments

    # 詳細セグメントの全座標を収集（間引き）
    real_coords = []
    for seg in real_segs:
        step = max(1, len(seg) // 100)
        for i in range(0, len(seg), step):
            real_coords.append(seg[i])
        if seg[-1] not in real_coords:
            real_coords.append(seg[-1])

    def is_covered_by_real(two_coord_seg: list) -> bool:
        """2座標セグメントの中点が詳細ジオメトリの近くにあるか"""
        mid_lat = (two_coord_seg[0][1] + two_coord_seg[1][1]) / 2
        mid_lng = (two_coord_seg[0][0] + two_coord_seg[1][0]) / 2
        # 中点から最も近い詳細座標までの距離
        min_dist = min(
            haversine_m(mid_lat, mid_lng, c[1], c[0]) for c in real_coords
        )
        seg_len = coord_dist(two_coord_seg[0], two_coord_seg[1])
        # セグメント長の半分以内に詳細座標があれば、カバー済み
        return min_dist < seg_len * 0.5

    kept = []
    for seg in segments:
        if len(seg) == 2:
            d = coord_dist(seg[0], seg[1])
            if d >= GAP_FILL_THRESHOLD_M and is_covered_by_real(seg):
                continue  # カバー済みの直線 → 除去
        kept.append(seg)
    return kept


def main() -> None:
    geojson_path = os.path.join(DATA_DIR, "geojson", "rail_lines.geojson")

    with open(geojson_path, encoding="utf-8") as f:
        geo = json.load(f)

    # Phase 1: 2座標直線アーティファクトを除去
    removed_total = 0
    for feat in geo["features"]:
        geom = feat["geometry"]
        name = feat["properties"]["name"]

        if geom["type"] != "MultiLineString":
            continue

        original_segs = geom["coordinates"]
        cleaned = remove_straight_line_artifacts(original_segs)
        removed = len(original_segs) - len(cleaned)

        if removed > 0:
            removed_total += removed
            print(f"  {name}: {removed} straight-line artifacts removed")
            if len(cleaned) == 0:
                # 全除去されたら最長セグメントを残す
                longest = max(original_segs, key=lambda s: len(s))
                cleaned = [longest]
                removed_total -= 1
            if len(cleaned) == 1:
                geom["type"] = "LineString"
                geom["coordinates"] = cleaned[0]
            else:
                geom["coordinates"] = cleaned

    print(f"\nRemoved {removed_total} straight-line artifacts")

    # Phase 2: ギャップ補完
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

    print(f"Filled {total_fills} gaps in {filled_count} features")

    # 保存
    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Saved: {geojson_path}")

    pub = os.path.join(PUBLIC_DIR, "geojson", "rail_lines.geojson")
    shutil.copy(geojson_path, pub)
    print(f"Copied: {pub}")


if __name__ == "__main__":
    main()
