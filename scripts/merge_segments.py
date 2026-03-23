#!/usr/bin/env python3
"""
同名の道路・川のセグメントを統合して連続LineStringにまとめる。

処理:
1. 同名featureのLineStringを収集
2. 端点が近い(CONNECT_THRESHOLD_M以内)セグメント同士を接続して連結
3. 道路名ごとに1つのfeature(MultiLineString)に統合
"""

import json
import math
import os
import shutil
import sys

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data")

# 端点同士がこの距離(m)以内なら接続可能とみなす
CONNECT_THRESHOLD_M = 50


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
    """GeoJSON座標 [lng, lat] 同士の距離(m)"""
    return haversine_m(c1[1], c1[0], c2[1], c2[0])


def chain_segments(segments: list[list[list[float]]]) -> list[list[list[float]]]:
    """
    端点が近いセグメントを連結してチェーンにする。
    入力: LineString座標のリスト
    出力: 連結後のLineString座標のリスト（連結できないものは独立のまま）
    """
    if not segments:
        return []

    # 各セグメントを使用済みかどうか追跡
    used = [False] * len(segments)
    chains: list[list[list[float]]] = []

    for start_idx in range(len(segments)):
        if used[start_idx]:
            continue
        used[start_idx] = True
        chain = list(segments[start_idx])

        # 前方・後方に伸ばせるだけ伸ばす
        changed = True
        while changed:
            changed = False
            chain_start = chain[0]
            chain_end = chain[-1]

            best_idx = -1
            best_dist = CONNECT_THRESHOLD_M
            best_end = ""  # "start" or "end" of candidate, connecting to chain's "start" or "end"
            best_chain_side = ""

            for i in range(len(segments)):
                if used[i]:
                    continue
                seg = segments[i]
                seg_start = seg[0]
                seg_end = seg[-1]

                # chain_end -> seg_start
                d = coord_dist(chain_end, seg_start)
                if d < best_dist:
                    best_dist, best_idx = d, i
                    best_end, best_chain_side = "start", "end"

                # chain_end -> seg_end (reverse seg)
                d = coord_dist(chain_end, seg_end)
                if d < best_dist:
                    best_dist, best_idx = d, i
                    best_end, best_chain_side = "end", "end"

                # seg_end -> chain_start
                d = coord_dist(seg_end, chain_start)
                if d < best_dist:
                    best_dist, best_idx = d, i
                    best_end, best_chain_side = "end", "start"

                # seg_start -> chain_start (reverse seg)
                d = coord_dist(seg_start, chain_start)
                if d < best_dist:
                    best_dist, best_idx = d, i
                    best_end, best_chain_side = "start", "start"

            if best_idx >= 0:
                used[best_idx] = True
                seg = segments[best_idx]
                changed = True

                if best_chain_side == "end":
                    if best_end == "start":
                        chain.extend(seg[1:])  # skip duplicate point
                    else:
                        chain.extend(list(reversed(seg))[1:])
                else:  # chain_side == "start"
                    if best_end == "end":
                        chain = list(seg) + chain[1:]
                    else:
                        chain = list(reversed(seg)) + chain[1:]

        chains.append(chain)

    return chains


def merge_geojson(input_path: str, output_path: str, public_path: str, id_prefix: str) -> None:
    with open(input_path, encoding="utf-8") as f:
        geo = json.load(f)

    # 名前ごとにセグメントを収集
    from collections import defaultdict

    name_segments: dict[str, list[list[list[float]]]] = defaultdict(list)
    for feat in geo["features"]:
        name = feat["properties"].get("name", "")
        geom = feat["geometry"]
        if geom["type"] == "LineString":
            name_segments[name].append(geom["coordinates"])
        elif geom["type"] == "MultiLineString":
            for seg in geom["coordinates"]:
                name_segments[name].append(seg)

    original_count = len(geo["features"])

    # 名前ごとにセグメントを連結・統合
    merged_features = []
    for name, segments in name_segments.items():
        chains = chain_segments(segments)

        if len(chains) == 1:
            geometry = {"type": "LineString", "coordinates": chains[0]}
        else:
            geometry = {"type": "MultiLineString", "coordinates": chains}

        merged_features.append(
            {
                "type": "Feature",
                "properties": {"id": f"{id_prefix}-{name}", "name": name},
                "geometry": geometry,
            }
        )

    geo["features"] = merged_features
    print(f"{os.path.basename(input_path)}: {original_count} features -> {len(merged_features)} features")
    for feat in merged_features:
        name = feat["properties"]["name"]
        geom = feat["geometry"]
        if geom["type"] == "LineString":
            print(f"  {name}: 1 chain (LineString)")
        else:
            print(f"  {name}: {len(geom['coordinates'])} chains (MultiLineString)")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  Saved: {output_path}")

    shutil.copy(output_path, public_path)
    print(f"  Copied: {public_path}")


def main() -> None:
    geojson_dir = os.path.join(DATA_DIR, "geojson")
    public_geojson_dir = os.path.join(PUBLIC_DIR, "geojson")

    merge_geojson(
        os.path.join(geojson_dir, "roads.geojson"),
        os.path.join(geojson_dir, "roads.geojson"),
        os.path.join(public_geojson_dir, "roads.geojson"),
        "road",
    )
    print()
    merge_geojson(
        os.path.join(geojson_dir, "rivers.geojson"),
        os.path.join(geojson_dir, "rivers.geojson"),
        os.path.join(public_geojson_dir, "rivers.geojson"),
        "river",
    )


if __name__ == "__main__":
    main()
