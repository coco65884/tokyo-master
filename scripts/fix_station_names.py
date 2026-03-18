#!/usr/bin/env python3
"""
駅名が取得できなかった stop_position ノードに対し、
近傍の railway=station ノードから名前をマッチングする。
"""

import json
import math
import os
import time
import urllib.request
import urllib.parse
from typing import Any

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")
OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def overpass_query(query: str) -> dict[str, Any]:
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    req = urllib.request.Request(
        OVERPASS_URL,
        data=data,
        headers={"User-Agent": "TokyoMaster/1.0"},
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            print(f"  Retry {attempt + 1}: {e}")
            if attempt < 2:
                time.sleep(15)
    raise RuntimeError("Overpass query failed")


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """2点間の距離(km)"""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def main() -> None:
    print("=== 駅名修正スクリプト ===")

    # 1. Overpassから全駅ノード（名前付き）を取得
    print("Named station nodes を取得中...")
    query = """
    [out:json][timeout:120];
    (
      node["railway"="station"]["name"](34.5,138.5,36.5,140.5);
      node["railway"="halt"]["name"](34.5,138.5,36.5,140.5);
      node["public_transport"="stop_position"]["name"](34.5,138.5,36.5,140.5);
      node["railway"="stop"]["name"](34.5,138.5,36.5,140.5);
    );
    out;
    """
    result = overpass_query(query)

    named_stations: list[dict[str, Any]] = []
    for elem in result["elements"]:
        if elem["type"] != "node":
            continue
        tags = elem.get("tags", {})
        name = tags.get("name", "")
        if not name:
            continue
        named_stations.append({
            "id": elem["id"],
            "name": name,
            "name_hira": tags.get("name:ja-Hira", tags.get("name:ja_rm", "")),
            "name_en": tags.get("name:en", tags.get("name:ja_rm", "")),
            "lat": elem["lat"],
            "lng": elem["lon"],
        })

    print(f"  Named stations: {len(named_stations)}")

    # 2. 現在の stations.json を読み込み
    stations_path = os.path.join(DATA_DIR, "stations", "stations.json")
    with open(stations_path, encoding="utf-8") as f:
        stations: list[dict[str, Any]] = json.load(f)

    # 3. 名前が不正な駅に対して近傍マッチング
    fixed = 0
    not_found = 0
    for st in stations:
        if not st["name"]["kanji"].startswith("駅-"):
            continue

        lat, lng = st["lat"], st["lng"]
        best_dist = float("inf")
        best_match: dict[str, Any] | None = None

        for ns in named_stations:
            d = haversine(lat, lng, ns["lat"], ns["lng"])
            if d < best_dist:
                best_dist = d
                best_match = ns

        if best_match and best_dist < 0.5:  # 500m以内
            st["name"]["kanji"] = best_match["name"]
            st["name"]["hiragana"] = best_match.get("name_hira", "")
            st["name"]["romaji"] = best_match.get("name_en", "")
            fixed += 1
        else:
            not_found += 1

    print(f"  Fixed: {fixed}, Not found: {not_found}")

    # 4. 保存
    with open(stations_path, "w", encoding="utf-8") as f:
        json.dump(stations, f, ensure_ascii=False, indent=2)
    print(f"  Saved: {stations_path}")

    # 5. line_index も再構築
    print("\nline_index を再構築中...")
    station_map = {s["id"]: s for s in stations}

    line_index_path = os.path.join(DATA_DIR, "lines", "line_index.json")
    with open(line_index_path, encoding="utf-8") as f:
        line_index = json.load(f)

    for line in line_index["lines"]:
        updated_stations = []
        for s in line["stations"]:
            if s["id"] in station_map:
                sm = station_map[s["id"]]
                updated_stations.append({
                    "id": s["id"],
                    "name": sm["name"]["kanji"],
                    "lat": sm["lat"],
                    "lng": sm["lng"],
                })
            else:
                updated_stations.append(s)
        line["stations"] = updated_stations

    # byOperator の stationCount も更新
    for op, entries in line_index["byOperator"].items():
        for entry in entries:
            matching_line = next((l for l in line_index["lines"] if l["key"] == entry["key"]), None)
            if matching_line:
                entry["stationCount"] = len(matching_line["stations"])

    with open(line_index_path, "w", encoding="utf-8") as f:
        json.dump(line_index, f, ensure_ascii=False, indent=2)
    print(f"  Saved: {line_index_path}")

    # 6. GeoJSON も更新
    geojson_path = os.path.join(DATA_DIR, "geojson", "stations.geojson")
    with open(geojson_path, encoding="utf-8") as f:
        geojson = json.load(f)

    for feature in geojson["features"]:
        sid = feature["properties"]["id"]
        if sid in station_map:
            feature["properties"]["name"] = station_map[sid]["name"]["kanji"]

    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  Saved: {geojson_path}")

    # public にもコピー
    import shutil
    shutil.copy(geojson_path, os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data", "geojson", "stations.geojson"))
    shutil.copy(line_index_path, os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data", "line_index.json"))
    print("  public/ にもコピー完了")

    print("\n=== 完了 ===")


if __name__ == "__main__":
    main()
