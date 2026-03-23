#!/usr/bin/env python3
"""
主要道路GeoJSONを距離の長い東京の幹線道路のみにフィルタする。
短い道路や東京外の同名道路を除去。

各道路名のセグメントを地理的にクラスタリングし、
最長クラスタの50%未満の長さの独立クラスタを除外する。
"""

import json
import math
import os
import shutil
from collections import defaultdict

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")

# 東京の主要幹線道路（完全一致で採用）
MAJOR_ROADS = {
    "環七通り",
    "環八通り",
    "甲州街道",
    "青梅街道",
    "明治通り",
    "山手通り",
    "中央通り",
    "外堀通り",
    "靖国通り",
    "目白通り",
    "新青梅街道",
    "新目白通り",
    "春日通り",
    "尾久橋通り",
    "駒沢通り",
    "旧甲州街道",
    "旧青梅街道",
    "井の頭通り",
    "五日市街道",
    "早稲田通り",
    "白山通り",
    "不忍通り",
    "言問通り",
    "清澄通り",
    "昭和通り",
    "日光街道",
    "水戸街道",
    "京葉道路",
    "蔵前橋通り",
    "三ツ目通り",
    "四ツ目通り",
    "永代通り",
    "晴海通り",
    "鎌倉街道",
    "府中街道",
    "小金井街道",
    "所沢街道",
    "志木街道",
    "川越街道",
    "中山道",
}

# 端点同士がこの距離(m)以内なら同一クラスタとみなす
CLUSTER_THRESHOLD_M = 300
# 最長クラスタに対してこの割合未満のクラスタは除外
CLUSTER_MIN_RATIO = 0.5


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """2点間の距離(km)を返す"""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """2点間の距離(m)を返す"""
    return haversine(lat1, lng1, lat2, lng2) * 1000


def line_length(coords: list) -> float:
    total = 0.0
    for i in range(1, len(coords)):
        total += haversine(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0])
    return total


def _extract_segments(feat: dict) -> list[dict]:
    """featureからセグメント情報(端点・長さ)のリストを抽出"""
    geom = feat["geometry"]
    segments = []
    if geom["type"] == "LineString":
        coords = geom["coordinates"]
        segments.append({
            "length": line_length(coords),
            "start": (coords[0][1], coords[0][0]),
            "end": (coords[-1][1], coords[-1][0]),
        })
    elif geom["type"] == "MultiLineString":
        for seg in geom["coordinates"]:
            segments.append({
                "length": line_length(seg),
                "start": (seg[0][1], seg[0][0]),
                "end": (seg[-1][1], seg[-1][0]),
            })
    return segments


def _cluster_segments(segments: list[dict]) -> dict[int, list[int]]:
    """Union-Findで端点が近いセグメントをクラスタリング"""
    n = len(segments)
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        a, b = find(a), find(b)
        if a != b:
            parent[a] = b

    for i in range(n):
        for j in range(i + 1, n):
            si, sj = segments[i], segments[j]
            for pi in [si["start"], si["end"]]:
                for pj in [sj["start"], sj["end"]]:
                    if haversine_m(pi[0], pi[1], pj[0], pj[1]) < CLUSTER_THRESHOLD_M:
                        union(i, j)

    clusters: dict[int, list[int]] = defaultdict(list)
    for i in range(n):
        clusters[find(i)].append(i)
    return clusters


def _get_keep_segment_indices(segments: list[dict]) -> set[int]:
    """最長クラスタの50%以上の長さを持つクラスタのセグメントindexを返す"""
    if not segments:
        return set()

    clusters = _cluster_segments(segments)
    cluster_lengths = {}
    for cid, indices in clusters.items():
        cluster_lengths[cid] = sum(segments[i]["length"] for i in indices)

    max_length = max(cluster_lengths.values())
    threshold = max_length * CLUSTER_MIN_RATIO

    keep = set()
    for cid, indices in clusters.items():
        if cluster_lengths[cid] >= threshold:
            keep.update(indices)
    return keep


def main() -> None:
    path = os.path.join(DATA_DIR, "geojson", "roads.geojson")
    with open(path, encoding="utf-8") as f:
        geo = json.load(f)

    # 道路名が完全一致するfeatureのみ残す
    name_filtered = []
    for feat in geo["features"]:
        name = feat["properties"].get("name", "")
        if name in MAJOR_ROADS:
            name_filtered.append(feat)

    print(f"Name-filtered: {len(name_filtered)} features")

    # 道路名ごとにセグメントを収集し、クラスタリングで短い独立区間を除外
    road_features: dict[str, list[dict]] = defaultdict(list)
    for feat in name_filtered:
        road_features[feat["properties"]["name"]].append(feat)

    filtered = []
    removed_count = 0
    for name, features in road_features.items():
        # 全featureのセグメントを抽出（feature境界を跨いでクラスタリング）
        all_segments = []
        feat_segment_ranges = []  # (feat, start_idx, end_idx)
        for feat in features:
            segs = _extract_segments(feat)
            start = len(all_segments)
            all_segments.extend(segs)
            feat_segment_ranges.append((feat, start, len(all_segments)))

        keep_indices = _get_keep_segment_indices(all_segments)

        for feat, start, end in feat_segment_ranges:
            # featureの全セグメントのうち1つでもkeepなら残す
            if any(i in keep_indices for i in range(start, end)):
                filtered.append(feat)
            else:
                removed_count += 1

    geo["features"] = filtered
    print(f"Cluster-filtered: {len(filtered)} features ({removed_count} removed)")

    # 道路名ごとの合計距離を計算
    road_lengths: dict[str, float] = defaultdict(float)
    for feat in filtered:
        name = feat["properties"]["name"]
        geom = feat["geometry"]
        if geom["type"] == "LineString":
            road_lengths[name] += line_length(geom["coordinates"])
        elif geom["type"] == "MultiLineString":
            for seg in geom["coordinates"]:
                road_lengths[name] += line_length(seg)

    for name, length in sorted(road_lengths.items(), key=lambda x: -x[1]):
        print(f"  {length:6.1f}km  {name}")

    # 保存
    with open(path, "w", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))
    print(f"\nSaved: {path}")

    # publicにコピー
    pub = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data", "geojson", "roads.geojson")
    shutil.copy(path, pub)
    print(f"Copied: {pub}")

    # roads.json も更新
    roads_meta_path = os.path.join(DATA_DIR, "roads.json")
    road_meta = [
        {"id": f"road-{name}", "name": {"kanji": name, "hiragana": "", "katakana": "", "romaji": ""}}
        for name in sorted(road_lengths.keys(), key=lambda n: -road_lengths[n])
    ]
    with open(roads_meta_path, "w", encoding="utf-8") as f:
        json.dump(road_meta, f, ensure_ascii=False, indent=2)
    print(f"Saved: {roads_meta_path} ({len(road_meta)} roads)")


if __name__ == "__main__":
    main()
