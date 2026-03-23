#!/usr/bin/env python3
"""
rail_lines.geojson の路線を駅データに基づいて再構築する。

各路線のMultiLineStringセグメントを駅順序でソートし、
ルートに属さないセグメントを除去、ギャップを直線接続で埋める。

アルゴリズム:
1. 各セグメントがどの駅区間をカバーするか判定
2. 駅順にセグメントをソートし、カバー範囲の重複を解決
3. カバーされないギャップを駅間直線で補完
4. ルートに属さないセグメント（どの駅にも近くない）を除去
"""

import json
import math
import os
import shutil

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data")

# セグメントの座標が駅からこの距離(m)以内なら「駅をカバーする」と判定
STATION_COVERAGE_M = 800


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def segment_length_m(coords: list) -> float:
    total = 0.0
    for i in range(1, len(coords)):
        total += haversine_m(
            coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]
        )
    return total


def find_station_coverage(
    seg_coords: list, stations: list[dict]
) -> set[int]:
    """セグメントがカバーする駅のインデックス集合を返す。
    セグメントの座標を間引きチェックして高速化。"""
    covered = set()
    # 全座標チェックすると遅いので、一定間隔 + 端点をチェック
    step = max(1, len(seg_coords) // 50)
    check_indices = list(range(0, len(seg_coords), step))
    if len(seg_coords) - 1 not in check_indices:
        check_indices.append(len(seg_coords) - 1)

    for ci in check_indices:
        c = seg_coords[ci]
        for si, st in enumerate(stations):
            if si in covered:
                continue
            if haversine_m(c[1], c[0], st["lat"], st["lng"]) < STATION_COVERAGE_M:
                covered.add(si)
    return covered


def reconstruct_route(
    segments: list[list], stations: list[dict]
) -> list[list]:
    """
    駅順序に基づいてセグメントを再構築する。

    1. 各セグメントの駅カバー範囲を判定
    2. 駅をカバーするセグメントは全て保持
    3. 駅順にソートし、向きを揃える
    4. セグメント間のギャップを直線接続で補完
    5. どの駅もカバーしないセグメント（孤児）のみ除去
    """
    if not stations or not segments:
        return segments

    # 各セグメントの駅カバー情報を計算
    seg_infos = []
    orphans = []
    for i, seg in enumerate(segments):
        coverage = find_station_coverage(seg, stations)
        if coverage:
            seg_infos.append(
                {
                    "idx": i,
                    "min_st": min(coverage),
                    "max_st": max(coverage),
                    "coverage": coverage,
                    "coords": seg,
                    "n_coords": len(seg),
                }
            )
        else:
            orphans.append(i)

    if not seg_infos:
        # どのセグメントも駅をカバーしない → そのまま返す
        return segments

    # 駅カバー範囲の開始順でソート、同じ開始なら座標数が多い方を優先
    seg_infos.sort(key=lambda x: (x["min_st"], -x["n_coords"]))

    # セグメントの向きを揃える（駅順序に沿うように）
    oriented = []
    for info in seg_infos:
        seg = info["coords"]
        first_st = stations[info["min_st"]]
        last_st = stations[info["max_st"]]
        d_start_first = haversine_m(
            seg[0][1], seg[0][0], first_st["lat"], first_st["lng"]
        )
        d_end_first = haversine_m(
            seg[-1][1], seg[-1][0], first_st["lat"], first_st["lng"]
        )
        if d_start_first > d_end_first:
            seg = list(reversed(seg))
        oriented.append(seg)

    # ギャップを直線接続で補完
    result = []
    for i, seg in enumerate(oriented):
        if i > 0 and result:
            last_end = result[-1][-1]
            this_start = seg[0]
            gap = haversine_m(
                last_end[1], last_end[0], this_start[1], this_start[0]
            )
            if gap > 50:  # 50m以上離れていたら接続セグメントを追加
                result.append([last_end, this_start])
        result.append(seg)

    return result


def main() -> None:
    geojson_path = os.path.join(DATA_DIR, "geojson", "rail_lines.geojson")
    index_path = os.path.join(DATA_DIR, "lines", "line_index.json")

    with open(geojson_path, encoding="utf-8") as f:
        geo = json.load(f)
    with open(index_path, encoding="utf-8") as f:
        index = json.load(f)

    # lineId → 駅リスト
    lid_to_stations: dict[str, list[dict]] = {}
    for line in index["lines"]:
        stations = line.get("stations", [])
        for lid in line.get("lineIds", []):
            lid_to_stations[lid] = stations

    reconstructed = 0
    removed_segs = 0

    for feat in geo["features"]:
        fid = feat["properties"]["id"]
        name = feat["properties"]["name"]
        geom = feat["geometry"]

        if geom["type"] != "MultiLineString":
            continue

        stations = lid_to_stations.get(fid, [])
        if len(stations) < 2:
            continue

        original_segments = geom["coordinates"]
        original_count = len(original_segments)

        new_segments = reconstruct_route(original_segments, stations)

        if len(new_segments) != original_count:
            removed = original_count - len(new_segments)
            removed_segs += abs(removed)
            reconstructed += 1
            print(
                f"  {name}: {original_count} segs -> {len(new_segments)} segs "
                f"({'+' if removed < 0 else '-'}{abs(removed)})"
            )

        if len(new_segments) == 1:
            geom["type"] = "LineString"
            geom["coordinates"] = new_segments[0]
        else:
            geom["coordinates"] = new_segments

    print(f"\nReconstructed {reconstructed} features")

    # 保存
    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Saved: {geojson_path}")

    pub = os.path.join(PUBLIC_DIR, "geojson", "rail_lines.geojson")
    shutil.copy(geojson_path, pub)
    print(f"Copied: {pub}")


if __name__ == "__main__":
    main()
