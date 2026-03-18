#!/usr/bin/env python3
"""
主要道路GeoJSONを距離の長い東京の幹線道路のみにフィルタする。
短い道路や東京外の同名道路を除去。
"""

import json
import math
import os
import shutil

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


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def line_length(coords: list) -> float:
    total = 0.0
    for i in range(1, len(coords)):
        total += haversine(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0])
    return total


def main() -> None:
    path = os.path.join(DATA_DIR, "geojson", "roads.geojson")
    with open(path, encoding="utf-8") as f:
        geo = json.load(f)

    # 道路名が完全一致するfeatureのみ残す
    filtered = []
    for feat in geo["features"]:
        name = feat["properties"].get("name", "")
        if name in MAJOR_ROADS:
            filtered.append(feat)

    geo["features"] = filtered
    print(f"Filtered: {len(filtered)} features")

    # 道路名ごとの合計距離を計算
    from collections import defaultdict
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
