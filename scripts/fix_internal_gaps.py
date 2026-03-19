#!/usr/bin/env python3
"""
セグメント内部のギャップ（ジャンプ）を検出し、
ジャンプ箇所で分割→再結合することで内部欠損を修正する。
interpolate_gaps.pyの後に実行。
"""

import json
import math
import os
import shutil

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")
JUMP_THRESHOLD_KM = 0.5
MERGE_THRESHOLD_KM = 2.0


def haversine(c1: list[float], c2: list[float]) -> float:
    R = 6371
    dlat = math.radians(c2[1] - c1[1])
    dlng = math.radians(c2[0] - c1[0])
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(c1[1])) * math.cos(math.radians(c2[1])) * math.sin(dlng / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def split_at_jumps(coords: list[list[float]], threshold_km: float) -> list[list[list[float]]]:
    """座標列をジャンプ箇所で分割"""
    if len(coords) < 2:
        return [coords] if coords else []
    segments = []
    current = [coords[0]]
    for i in range(1, len(coords)):
        if haversine(coords[i - 1], coords[i]) > threshold_km:
            if len(current) >= 2:
                segments.append(current)
            current = [coords[i]]
        else:
            current.append(coords[i])
    if len(current) >= 2:
        segments.append(current)
    return segments


def greedy_merge(segments: list[list[list[float]]], threshold_km: float) -> list[list[list[float]]]:
    """セグメントをgreedy接続で結合"""
    if len(segments) <= 1:
        return segments

    result = [segments[0][:]]
    remaining = [s[:] for s in segments[1:]]

    changed = True
    while changed and remaining:
        changed = False
        best_i = -1
        best_d = float("inf")
        best_how = ""

        for i, seg in enumerate(remaining):
            combos = [
                (haversine(result[-1][-1], seg[0]), "end-start", i),
                (haversine(result[-1][-1], seg[-1]), "end-end", i),
                (haversine(result[-1][0], seg[-1]), "start-end", i),
                (haversine(result[-1][0], seg[0]), "start-start", i),
            ]
            for d, how, idx in combos:
                if d < best_d:
                    best_d, best_how, best_i = d, how, idx

        if best_d > threshold_km or best_i < 0:
            if remaining:
                result.append(remaining.pop(0))
                changed = True
            continue

        seg = remaining.pop(best_i)
        changed = True

        if best_how == "end-start":
            result[-1].append(seg[0])
            result[-1].extend(seg[1:])
        elif best_how == "end-end":
            result[-1].append(seg[-1])
            result[-1].extend(list(reversed(seg))[1:])
        elif best_how == "start-end":
            seg.append(result[-1][0])
            result[-1] = seg + result[-1][1:]
        elif best_how == "start-start":
            result[-1] = list(reversed(seg)) + [result[-1][0]] + result[-1][1:]

    result.extend(remaining)
    return result


def main() -> None:
    path = os.path.join(DATA_DIR, "geojson", "rail_lines.geojson")
    with open(path, encoding="utf-8") as f:
        geo = json.load(f)

    fixed = 0
    for feat in geo["features"]:
        geom = feat["geometry"]
        name = feat["properties"].get("name", "")

        # 全座標を取得
        if geom["type"] == "LineString":
            all_segs = [geom["coordinates"]]
        elif geom["type"] == "MultiLineString":
            all_segs = geom["coordinates"]
        else:
            continue

        # 各セグメント内のジャンプを検出して分割
        new_segs = []
        had_internal_gaps = False
        for seg in all_segs:
            split = split_at_jumps(seg, JUMP_THRESHOLD_KM)
            if len(split) > 1:
                had_internal_gaps = True
            new_segs.extend(split)

        if not had_internal_gaps:
            continue

        # 分割したセグメントを再結合
        merged = greedy_merge(new_segs, MERGE_THRESHOLD_KM)

        if len(merged) != len(all_segs) or had_internal_gaps:
            fixed += 1
            if len(merged) == 1:
                geom["type"] = "LineString"
                geom["coordinates"] = merged[0]
            else:
                geom["type"] = "MultiLineString"
                geom["coordinates"] = merged
            print(f"  {name}: {len(all_segs)}seg(内部gap有) → {len(new_segs)}seg(分割) → {len(merged)}seg(再結合)")

    print(f"\nTotal fixed: {fixed}")

    with open(path, "w", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))
    pub = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data", "geojson", "rail_lines.geojson")
    shutil.copy(path, pub)
    print(f"Saved")


if __name__ == "__main__":
    main()
