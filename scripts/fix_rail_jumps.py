#!/usr/bin/env python3
"""
路線GeoJSONの座標飛び（ジャンプ）を検出し、
LineStringをMultiLineStringに分割して不正な直線を除去する。
"""

import json
import math
import os

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")
MAX_JUMP_KM = 0.5  # 500m以上のジャンプで分割


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def split_at_jumps(coords: list[list[float]]) -> list[list[list[float]]]:
    """座標列をジャンプ箇所で分割"""
    if len(coords) < 2:
        return [coords] if coords else []

    segments: list[list[list[float]]] = []
    current: list[list[float]] = [coords[0]]

    for i in range(1, len(coords)):
        dist = haversine(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0])
        if dist > MAX_JUMP_KM:
            if len(current) >= 2:
                segments.append(current)
            current = [coords[i]]
        else:
            current.append(coords[i])

    if len(current) >= 2:
        segments.append(current)

    return segments


def main() -> None:
    path = os.path.join(DATA_DIR, "geojson", "rail_lines.geojson")
    with open(path, encoding="utf-8") as f:
        geo = json.load(f)

    fixed = 0
    total = len(geo["features"])

    for feat in geo["features"]:
        geom = feat["geometry"]
        if geom["type"] != "LineString":
            continue

        coords = geom["coordinates"]
        segments = split_at_jumps(coords)

        if len(segments) == 0:
            continue
        elif len(segments) == 1:
            # ジャンプなし or 短いセグメントのみ
            feat["geometry"] = {"type": "LineString", "coordinates": segments[0]}
        else:
            # 複数セグメントに分割
            feat["geometry"] = {"type": "MultiLineString", "coordinates": segments}
            fixed += 1

    print(f"Total features: {total}, Fixed (split): {fixed}")

    # 保存
    with open(path, "w", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Saved: {path}")

    # publicにもコピー
    import shutil
    pub_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data", "geojson", "rail_lines.geojson")
    shutil.copy(path, pub_path)
    print(f"Copied to: {pub_path}")


if __name__ == "__main__":
    main()
