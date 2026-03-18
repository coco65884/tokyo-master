#!/usr/bin/env python3
"""
line_indexに欠落している路線を追加する。
- 東武東上線: Overpass APIから取得
- 西武池袋線: 手動定義（OSMに純粋な各停routeがないため）
"""

import json
import math
import os
import time
import urllib.request
import urllib.parse
import shutil
from typing import Any

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")
OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def overpass_query(query: str) -> dict[str, Any]:
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    req = urllib.request.Request(OVERPASS_URL, data=data, headers={"User-Agent": "TokyoMaster/1.0"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            print(f"  Retry {attempt+1}: {e}")
            if attempt < 2:
                time.sleep(15)
    raise RuntimeError("Overpass query failed")


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlng/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def sort_greedy(stations: list[dict], start_name: str) -> list[dict]:
    start_idx = next((i for i, s in enumerate(stations) if start_name in s["name"]), 0)
    result = [stations[start_idx]]
    remaining = [s for i, s in enumerate(stations) if i != start_idx]
    while remaining:
        cur = result[-1]
        nearest = min(range(len(remaining)), key=lambda i: haversine(cur["lat"], cur["lng"], remaining[i]["lat"], remaining[i]["lng"]))
        result.append(remaining.pop(nearest))
    return result


def fetch_tojo_stations() -> list[dict]:
    """東武東上線の駅をOverpass APIから取得"""
    print("東武東上線の駅を取得中...")
    query = """
    [out:json][timeout:120];
    relation(10032017);
    out geom;
    """
    result = overpass_query(query)

    stations = []
    seen = set()
    for elem in result["elements"]:
        if elem["type"] != "relation":
            continue
        for member in elem.get("members", []):
            if member["type"] == "node" and member.get("role") in ("stop", "stop_entry_only", "stop_exit_only"):
                if "lon" in member and "lat" in member:
                    nid = member["ref"]
                    if nid in seen:
                        continue
                    seen.add(nid)
                    stations.append({
                        "id": f"station-{nid}",
                        "name": "",
                        "lat": member["lat"],
                        "lng": member["lon"],
                    })

    # 駅名を取得
    if stations:
        node_ids = [s["id"].replace("station-", "") for s in stations]
        id_str = ",".join(node_ids)
        name_query = f"""
        [out:json][timeout:60];
        (
          node(id:{id_str});
        );
        out tags;
        """
        time.sleep(5)
        name_result = overpass_query(name_query)
        name_map = {}
        for elem in name_result["elements"]:
            if elem["type"] == "node":
                name_map[elem["id"]] = elem.get("tags", {}).get("name", "")

        for s in stations:
            nid = int(s["id"].replace("station-", ""))
            s["name"] = name_map.get(nid, "")

    # 名前がない駅は近傍マッチング
    if any(not s["name"] for s in stations):
        print("  名前なし駅の近傍マッチング...")
        time.sleep(5)
        named_query = """
        [out:json][timeout:60];
        node["railway"="station"]["name"](35.5,139.0,36.2,139.8);
        out;
        """
        named_result = overpass_query(named_query)
        named_stations = [
            {"name": e.get("tags", {}).get("name", ""), "lat": e["lat"], "lng": e["lon"]}
            for e in named_result["elements"]
            if e["type"] == "node" and e.get("tags", {}).get("name")
        ]

        for s in stations:
            if s["name"]:
                continue
            best_dist = float("inf")
            best_name = ""
            for ns in named_stations:
                d = haversine(s["lat"], s["lng"], ns["lat"], ns["lng"])
                if d < best_dist:
                    best_dist = d
                    best_name = ns["name"]
            if best_dist < 0.5:
                s["name"] = best_name

    # 名前で重複排除
    deduped = {}
    for s in stations:
        if not s["name"] or s["name"].startswith("駅-"):
            continue
        key = f"{s['name']}_{round(s['lat']*100)}_{round(s['lng']*100)}"
        if key not in deduped:
            deduped[key] = s

    result_stations = list(deduped.values())
    result_stations = sort_greedy(result_stations, "池袋")
    print(f"  東武東上線: {len(result_stations)}駅")
    return result_stations


def get_seibu_ikebukuro() -> list[dict]:
    """西武池袋線の駅（手動定義）"""
    print("西武池袋線（手動定義）...")
    stations = [
        {"name": "池袋", "lat": 35.7295, "lng": 139.7109},
        {"name": "椎名町", "lat": 35.7244, "lng": 139.6978},
        {"name": "東長崎", "lat": 35.7249, "lng": 139.6870},
        {"name": "江古田", "lat": 35.7344, "lng": 139.6735},
        {"name": "桜台", "lat": 35.7380, "lng": 139.6617},
        {"name": "練馬", "lat": 35.7374, "lng": 139.6536},
        {"name": "中村橋", "lat": 35.7380, "lng": 139.6399},
        {"name": "富士見台", "lat": 35.7368, "lng": 139.6302},
        {"name": "練馬高野台", "lat": 35.7352, "lng": 139.6195},
        {"name": "石神井公園", "lat": 35.7434, "lng": 139.6066},
        {"name": "大泉学園", "lat": 35.7520, "lng": 139.5876},
        {"name": "保谷", "lat": 35.7581, "lng": 139.5700},
        {"name": "ひばりヶ丘", "lat": 35.7527, "lng": 139.5441},
        {"name": "東久留米", "lat": 35.7557, "lng": 139.5303},
        {"name": "清瀬", "lat": 35.7711, "lng": 139.5185},
        {"name": "秋津", "lat": 35.7676, "lng": 139.4995},
        {"name": "所沢", "lat": 35.7868, "lng": 139.4690},
        {"name": "西所沢", "lat": 35.7830, "lng": 139.4517},
        {"name": "小手指", "lat": 35.7798, "lng": 139.4332},
        {"name": "狭山ヶ丘", "lat": 35.7726, "lng": 139.4169},
        {"name": "武蔵藤沢", "lat": 35.7763, "lng": 139.4025},
        {"name": "稲荷山公園", "lat": 35.7795, "lng": 139.3892},
        {"name": "入間市", "lat": 35.7780, "lng": 139.3722},
        {"name": "仏子", "lat": 35.7952, "lng": 139.3534},
        {"name": "元加治", "lat": 35.8037, "lng": 139.3434},
        {"name": "飯能", "lat": 35.8554, "lng": 139.3290},
    ]
    for i, s in enumerate(stations):
        s["id"] = f"station-seibu-ikebukuro-{i}"
    print(f"  西武池袋線: {len(stations)}駅")
    return stations


def main() -> None:
    path = os.path.join(DATA_DIR, "lines", "line_index.json")
    with open(path, encoding="utf-8") as f:
        idx = json.load(f)

    # 東武東上線を追加
    tojo_stations = fetch_tojo_stations()
    tojo_entry = {
        "key": "Tobu::東武東上線",
        "name": "東武東上線",
        "abbr": "TJ",
        "operator": "Tobu",
        "color": "#0f378e",
        "lineIds": ["line-10032017", "line-10032085"],
        "stations": [{"id": s["id"], "name": s["name"], "lat": s["lat"], "lng": s["lng"]} for s in tojo_stations],
    }

    # 既存の西武池袋線を置き換え
    ikebukuro_stations = get_seibu_ikebukuro()

    # 既存エントリを更新/追加
    existing_keys = {l["key"] for l in idx["lines"]}

    if "Tobu::東武東上線" not in existing_keys:
        idx["lines"].append(tojo_entry)
        print("東武東上線を追加")

    # 西武池袋線を置き換え
    for line in idx["lines"]:
        if line["name"] == "西武池袋線":
            line["stations"] = [{"id": s["id"], "name": s["name"], "lat": s["lat"], "lng": s["lng"]} for s in ikebukuro_stations]
            line["abbr"] = "SI"
            print(f"西武池袋線を更新: {len(ikebukuro_stations)}駅")
            break
    else:
        idx["lines"].append({
            "key": "Seibu::西武池袋線",
            "name": "西武池袋線",
            "abbr": "SI",
            "operator": "Seibu",
            "color": "#00498b",
            "lineIds": [],
            "stations": [{"id": s["id"], "name": s["name"], "lat": s["lat"], "lng": s["lng"]} for s in ikebukuro_stations],
        })
        print("西武池袋線を追加")

    # byOperator に追加分のみ挿入（既存を上書きしない）
    def upsert_by_operator(line_data: dict) -> None:
        op = line_data["operator"]
        entry = {
            "key": line_data["key"],
            "name": line_data["name"],
            "abbr": line_data.get("abbr", ""),
            "color": line_data["color"],
            "lineIds": line_data["lineIds"],
            "stationCount": len(line_data["stations"]),
        }
        if op not in idx["byOperator"]:
            idx["byOperator"][op] = []
        existing_keys = {e["key"] for e in idx["byOperator"][op]}
        if entry["key"] not in existing_keys:
            idx["byOperator"][op].append(entry)
        else:
            # 既存エントリを更新
            for i, e in enumerate(idx["byOperator"][op]):
                if e["key"] == entry["key"]:
                    idx["byOperator"][op][i] = entry
                    break

    upsert_by_operator(tojo_entry)
    # 西武池袋線のbyOperatorも更新
    for line in idx["lines"]:
        if line["name"] == "西武池袋線":
            upsert_by_operator(line)
            break

    with open(path, "w", encoding="utf-8") as f:
        json.dump(idx, f, ensure_ascii=False, indent=2)
    print(f"\nSaved: {path}")

    pub = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data", "line_index.json")
    shutil.copy(path, pub)
    print(f"Copied: {pub}")

    # GeoJSONにも東武東上線のroute を追加
    add_tojo_geojson()


def add_tojo_geojson() -> None:
    """東武東上線のGeoJSONを追加"""
    print("\n東武東上線のGeoJSONを取得中...")
    time.sleep(5)
    query = """
    [out:json][timeout:120];
    relation(10032017);
    out geom;
    """
    result = overpass_query(query)

    coords = []
    for elem in result["elements"]:
        if elem["type"] != "relation":
            continue
        for member in elem.get("members", []):
            if member["type"] == "way" and "geometry" in member:
                role = member.get("role", "")
                if role in ("", "forward", "backward"):
                    for pt in member["geometry"]:
                        coords.append([round(pt["lon"], 5), round(pt["lat"], 5)])

    if not coords:
        print("  GeoJSON座標なし")
        return

    # ジャンプで分割
    import math
    segments = []
    current = [coords[0]]
    for i in range(1, len(coords)):
        dlat = abs(coords[i][1] - coords[i-1][1])
        dlng = abs(coords[i][0] - coords[i-1][0])
        dist = math.sqrt(dlat**2 + dlng**2) * 111  # 概算km
        if dist > 0.5:
            if len(current) >= 2:
                segments.append(current)
            current = [coords[i]]
        else:
            current.append(coords[i])
    if len(current) >= 2:
        segments.append(current)

    feature = {
        "type": "Feature",
        "properties": {"id": "line-10032017", "name": "東武東上線", "operator": "Tobu", "color": "#0f378e"},
        "geometry": {
            "type": "MultiLineString" if len(segments) > 1 else "LineString",
            "coordinates": segments if len(segments) > 1 else segments[0] if segments else [],
        },
    }

    geo_path = os.path.join(DATA_DIR, "geojson", "rail_lines.geojson")
    with open(geo_path, encoding="utf-8") as f:
        geo = json.load(f)

    # 既存の東武東上線を削除してから追加
    geo["features"] = [f for f in geo["features"] if f["properties"].get("id") != "line-10032017"]
    geo["features"].append(feature)

    with open(geo_path, "w", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  GeoJSON追加: {len(segments)}セグメント, {sum(len(s) for s in segments)}座標")

    pub = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data", "geojson", "rail_lines.geojson")
    shutil.copy(geo_path, pub)


if __name__ == "__main__":
    main()
