#!/usr/bin/env python3
"""
路線GeoJSONのMultiLineStringセグメント間のギャップを検出し、
近いセグメント端点を直線で接続して補間する。

方針:
1. 各路線のセグメントを端点間距離でソート
2. 近い端点同士をgreedy接続で1本に結合
3. 結合できなかった短いギャップ(<2km)は直線で補間
"""

import json
import math
import os
import shutil

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")
MAX_GAP_KM = 2.0  # この距離以内のギャップは直線で補間


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def endpoint_dist(seg_a: list, seg_b: list) -> tuple[float, str]:
    """2セグメントの端点間の最短距離と接続方向を返す"""
    combos = [
        (haversine(seg_a[-1][1], seg_a[-1][0], seg_b[0][1], seg_b[0][0]), "end-start"),
        (haversine(seg_a[-1][1], seg_a[-1][0], seg_b[-1][1], seg_b[-1][0]), "end-end"),
        (haversine(seg_a[0][1], seg_a[0][0], seg_b[-1][1], seg_b[-1][0]), "start-end"),
        (haversine(seg_a[0][1], seg_a[0][0], seg_b[0][1], seg_b[0][0]), "start-start"),
    ]
    return min(combos, key=lambda x: x[0])


def merge_segments(segments: list[list[list[float]]]) -> list[list[list[float]]]:
    """セグメントをgreedy接続で結合し、残ったギャップを直線補間"""
    if len(segments) <= 1:
        return segments

    # greedy: 各ステップで最も近い端点同士を接続
    merged = [list(segments[0])]
    remaining = [list(s) for s in segments[1:]]

    changed = True
    while changed and remaining:
        changed = False
        best_i = -1
        best_dist = float("inf")
        best_direction = ""

        for i, seg in enumerate(remaining):
            d, direction = endpoint_dist(merged[-1], seg)
            if d < best_dist:
                best_dist = d
                best_i = i
                best_direction = direction

        if best_dist > MAX_GAP_KM or best_i < 0:
            # 残りも同様に処理（別のmergedチェーンに）
            if remaining:
                merged.append(remaining.pop(0))
                changed = True
            continue

        seg = remaining.pop(best_i)
        changed = True

        if best_direction == "end-start":
            # merged末尾 → seg先頭: そのまま接続（ギャップを直線で）
            if best_dist > 0.01:  # 10m以上離れていたら補間点を挿入
                merged[-1].append(seg[0])
            merged[-1].extend(seg[1:])
        elif best_direction == "end-end":
            if best_dist > 0.01:
                merged[-1].append(seg[-1])
            merged[-1].extend(list(reversed(seg))[1:])
        elif best_direction == "start-end":
            if best_dist > 0.01:
                seg.append(merged[-1][0])
            merged[-1] = seg + merged[-1][1:]
        elif best_direction == "start-start":
            if best_dist > 0.01:
                merged[-1] = [seg[0]] + merged[-1]
            merged[-1] = list(reversed(seg)) + merged[-1][1:]

    # 残りをそのまま追加
    merged.extend(remaining)

    return merged


def main() -> None:
    path = os.path.join(DATA_DIR, "geojson", "rail_lines.geojson")
    with open(path, encoding="utf-8") as f:
        geo = json.load(f)

    total_fixed = 0
    total_gaps_filled = 0

    for feat in geo["features"]:
        geom = feat["geometry"]
        name = feat["properties"].get("name", "")

        if geom["type"] == "LineString":
            continue  # 単一LineStringはスキップ

        if geom["type"] != "MultiLineString":
            continue

        segments = geom["coordinates"]
        if len(segments) <= 1:
            continue

        # ギャップを検出
        gaps = []
        for i in range(len(segments)):
            for j in range(i + 1, len(segments)):
                d, _ = endpoint_dist(segments[i], segments[j])
                if 0.01 < d < MAX_GAP_KM:
                    gaps.append((d, i, j))

        if not gaps:
            continue

        # セグメントを結合
        original_count = len(segments)
        merged = merge_segments(segments)

        if len(merged) < original_count:
            total_fixed += 1
            total_gaps_filled += original_count - len(merged)
            geom["coordinates"] = merged
            if len(merged) == 1:
                geom["type"] = "LineString"
                geom["coordinates"] = merged[0]
            print(f"  {name}: {original_count}seg → {len(merged)}seg ({original_count - len(merged)} gaps filled)")

    print(f"\nTotal: {total_fixed} lines fixed, {total_gaps_filled} gaps filled")

    with open(path, "w", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))
    pub = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data", "geojson", "rail_lines.geojson")
    shutil.copy(path, pub)
    print(f"Saved: {path}")


if __name__ == "__main__":
    main()
