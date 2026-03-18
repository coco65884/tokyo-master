#!/usr/bin/env python3
"""
東京の地理データを OpenStreetMap Overpass API から収集するスクリプト。
収集したデータは src/data/ 以下にJSON/GeoJSONとして保存する。
"""

import json
import os
import time
import urllib.request
import urllib.parse
from typing import Any

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")

REQUEST_INTERVAL = 10


def overpass_query(query: str, retries: int = 3) -> dict[str, Any]:
    """Overpass APIにクエリを送信してJSONを返す。リトライ付き。"""
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    req = urllib.request.Request(
        OVERPASS_URL,
        data=data,
        headers={"User-Agent": "TokyoMaster/1.0 (geography quiz app)"},
    )
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            print(f"  リトライ {attempt + 1}/{retries}: {e}")
            if attempt < retries - 1:
                time.sleep(15)
    raise RuntimeError("Overpass API query failed after retries")


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def save_json(data: Any, filepath: str) -> None:
    ensure_dir(os.path.dirname(filepath))
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    size_kb = os.path.getsize(filepath) / 1024
    print(f"  Saved: {filepath} ({size_kb:.1f} KB)")


# ============================================================
# 1. 東京都の区市町村境界
# ============================================================
def collect_ward_boundaries() -> None:
    print("\n[1/6] 区市町村境界を収集中...")
    # out geom を使って直接ジオメトリを取得（ノード展開不要）
    query = """
    [out:json][timeout:180];
    area["name"="東京都"]["admin_level"="4"]->.tokyo;
    (
      relation["admin_level"="7"](area.tokyo);
      relation["admin_level"="8"](area.tokyo);
    );
    out geom;
    """
    result = overpass_query(query)

    features = []
    wards_meta: list[dict[str, Any]] = []

    for elem in result["elements"]:
        if elem["type"] != "relation":
            continue
        tags = elem.get("tags", {})
        name = tags.get("name", "")
        if not name:
            continue

        # メンバーからouter境界の座標を取得
        outer_rings: list[list[list[float]]] = []
        for member in elem.get("members", []):
            if member.get("role") == "outer" and "geometry" in member:
                coords = [[pt["lon"], pt["lat"]] for pt in member["geometry"]]
                if len(coords) >= 2:
                    outer_rings.append(coords)

        if not outer_rings:
            continue

        # リングを結合
        merged = merge_rings(outer_rings)
        if not merged:
            continue

        ward_type = (
            "ku" if name.endswith("区")
            else "shi" if name.endswith("市")
            else "machi" if name.endswith("町")
            else "mura"
        )

        wid = f"ward-{elem['id']}"
        if len(merged) == 1:
            geometry = {"type": "Polygon", "coordinates": merged}
        else:
            geometry = {"type": "MultiPolygon", "coordinates": [[ring] for ring in merged]}

        features.append({
            "type": "Feature",
            "properties": {"id": wid, "name": name, "type": ward_type},
            "geometry": geometry,
        })

        wards_meta.append({
            "id": wid,
            "name": {"kanji": name, "hiragana": "", "katakana": "", "romaji": ""},
            "type": ward_type,
        })

    geojson = {"type": "FeatureCollection", "features": features}
    save_json(geojson, os.path.join(DATA_DIR, "geojson", "wards.geojson"))
    save_json(wards_meta, os.path.join(DATA_DIR, "wards.json"))
    print(f"  {len(features)} 区市町村を収集")


def merge_rings(
    segments: list[list[list[float]]],
) -> list[list[list[float]]]:
    """Way座標セグメントを接続してリングにする"""
    if not segments:
        return []

    rings: list[list[list[float]]] = []
    remaining = [list(s) for s in segments if len(s) >= 2]
    if not remaining:
        return []

    current = remaining.pop(0)
    max_iterations = len(remaining) * len(remaining) + 100

    iteration = 0
    while remaining and iteration < max_iterations:
        iteration += 1
        found = False
        for i, seg in enumerate(remaining):
            if not seg:
                continue
            # 末尾-先頭接続
            if coords_equal(current[-1], seg[0]):
                current.extend(seg[1:])
                remaining.pop(i)
                found = True
                break
            # 末尾-末尾接続
            elif coords_equal(current[-1], seg[-1]):
                current.extend(list(reversed(seg))[1:])
                remaining.pop(i)
                found = True
                break
            # 先頭-末尾接続
            elif coords_equal(current[0], seg[-1]):
                current = seg + current[1:]
                remaining.pop(i)
                found = True
                break
            # 先頭-先頭接続
            elif coords_equal(current[0], seg[0]):
                current = list(reversed(seg)) + current[1:]
                remaining.pop(i)
                found = True
                break

        if not found:
            close_ring(current)
            if len(current) >= 4:
                rings.append(current)
            if remaining:
                current = remaining.pop(0)
            else:
                current = []
                break

        # リングが閉じたか
        if len(current) > 2 and coords_equal(current[0], current[-1]):
            rings.append(current)
            if remaining:
                current = remaining.pop(0)
            else:
                current = []
                break

    if current:
        close_ring(current)
        if len(current) >= 4:
            rings.append(current)

    return rings


def coords_equal(a: list[float], b: list[float]) -> bool:
    return abs(a[0] - b[0]) < 1e-7 and abs(a[1] - b[1]) < 1e-7


def close_ring(coords: list[list[float]]) -> None:
    if len(coords) > 2 and not coords_equal(coords[0], coords[-1]):
        coords.append(coords[0])


# ============================================================
# 2. 都道府県境界
# ============================================================
def collect_pref_boundaries() -> None:
    print("\n[2/6] 都道府県境界を収集中...")
    query = """
    [out:json][timeout:180];
    (
      relation["name"="東京都"]["admin_level"="4"];
      relation["name"="神奈川県"]["admin_level"="4"];
      relation["name"="埼玉県"]["admin_level"="4"];
      relation["name"="千葉県"]["admin_level"="4"];
    );
    out geom;
    """
    result = overpass_query(query)

    features = []
    for elem in result["elements"]:
        if elem["type"] != "relation":
            continue
        tags = elem.get("tags", {})
        name = tags.get("name", "")
        if not name:
            continue

        for member in elem.get("members", []):
            if member.get("role") == "outer" and "geometry" in member:
                coords = [[pt["lon"], pt["lat"]] for pt in member["geometry"]]
                if len(coords) >= 2:
                    features.append({
                        "type": "Feature",
                        "properties": {"name": name},
                        "geometry": {"type": "LineString", "coordinates": coords},
                    })

    geojson = {"type": "FeatureCollection", "features": features}
    save_json(geojson, os.path.join(DATA_DIR, "geojson", "pref_borders.geojson"))
    print(f"  {len(features)} 境界セグメントを収集")


# ============================================================
# 3. 鉄道路線・駅
# ============================================================
LINE_COLORS: dict[str, str] = {
    "山手線": "#9acd32",
    "中央線快速": "#ff4500",
    "中央・総武緩行線": "#ffd700",
    "中央・総武線各駅停車": "#ffd700",
    "京浜東北線": "#00bfff",
    "東海道線": "#ff8c00",
    "総武線快速": "#0000cd",
    "埼京線": "#008000",
    "湘南新宿ライン": "#ff4500",
    "南武線": "#ffd700",
    "武蔵野線": "#ff4500",
    "京葉線": "#dc143c",
    "常磐線": "#008000",
    "青梅線": "#008000",
    "横浜線": "#7fc342",
    "銀座線": "#ff9500",
    "丸ノ内線": "#f62e36",
    "日比谷線": "#b5b5ac",
    "東西線": "#009bbf",
    "千代田線": "#00bb85",
    "有楽町線": "#c1a470",
    "半蔵門線": "#8f76d6",
    "南北線": "#00ac9b",
    "副都心線": "#9c5e31",
    "都営浅草線": "#e85298",
    "都営三田線": "#0079c2",
    "都営新宿線": "#6cbb5a",
    "都営大江戸線": "#b6007a",
    "京王線": "#dd0077",
    "京王井の頭線": "#1d2088",
    "小田急小田原線": "#1e90ff",
    "小田急多摩線": "#1e90ff",
    "小田急江ノ島線": "#1e90ff",
    "東急東横線": "#da0442",
    "東急田園都市線": "#00a040",
    "東急目黒線": "#009cd2",
    "東急大井町線": "#f18c43",
    "東急池上線": "#ee86a7",
    "東急世田谷線": "#ffdd00",
    "西武新宿線": "#00498b",
    "西武池袋線": "#00498b",
    "京急本線": "#e8334a",
    "京急空港線": "#e8334a",
    "東武東上線": "#0f378e",
    "東武伊勢崎線": "#0f378e",
    "東武スカイツリーライン": "#0f378e",
    "つくばエクスプレス": "#2e3192",
    "京成本線": "#003399",
    "京成押上線": "#003399",
    "ゆりかもめ": "#009fa1",
    "りんかい線": "#00b5ad",
    "多摩モノレール": "#ff7f00",
}

RAIL_OPERATORS_FILTER = [
    "JR東日本", "東京地下鉄", "東京都交通局",
    "京王電鉄", "小田急電鉄", "東急電鉄",
    "西武鉄道", "京浜急行電鉄", "東武鉄道",
    "首都圏新都市鉄道", "京成電鉄",
    "多摩都市モノレール", "ゆりかもめ", "東京臨海高速鉄道",
]

OPERATOR_MAP: dict[str, str] = {
    "JR東日本": "JR",
    "東日本旅客鉄道": "JR",
    "東京地下鉄": "Metro",
    "東京都交通局": "Toei",
    "京王電鉄": "Keio",
    "小田急電鉄": "Odakyu",
    "東急電鉄": "Tokyu",
    "西武鉄道": "Seibu",
    "京浜急行電鉄": "Keikyu",
    "東武鉄道": "Tobu",
    "首都圏新都市鉄道": "TX",
    "京成電鉄": "Keisei",
    "多摩都市モノレール": "TamaMonorail",
    "ゆりかもめ": "Yurikamome",
    "東京臨海高速鉄道": "TWR",
}


def get_operator_key(operator: str) -> str | None:
    for op_name, op_key in OPERATOR_MAP.items():
        if op_name in operator:
            return op_key
    return None


def collect_rail_data() -> None:
    print("\n[3/6] 鉄道路線・駅データを収集中...")

    # 東京周辺 bbox で鉄道ルートを取得
    query = """
    [out:json][timeout:180];
    (
      relation["type"="route"]["route"="train"](35.0,138.8,36.1,140.2);
      relation["type"="route"]["route"="subway"](35.0,138.8,36.1,140.2);
      relation["type"="route"]["route"="light_rail"](35.0,138.8,36.1,140.2);
      relation["type"="route"]["route"="monorail"](35.0,138.8,36.1,140.2);
    );
    out geom;
    """
    result = overpass_query(query)

    lines_data: list[dict[str, Any]] = []
    all_stations: dict[str, dict[str, Any]] = {}
    line_features: list[dict[str, Any]] = []

    for elem in result["elements"]:
        if elem["type"] != "relation":
            continue
        tags = elem.get("tags", {})
        operator = tags.get("operator", "")
        name = tags.get("name", "")
        if not name:
            continue

        operator_key = get_operator_key(operator)
        if not operator_key:
            continue

        line_id = f"line-{elem['id']}"
        color = LINE_COLORS.get(name, "#888888")

        # 路線座標
        line_coords: list[list[float]] = []
        station_ids: list[str] = []

        for member in elem.get("members", []):
            if member["type"] == "way" and "geometry" in member:
                role = member.get("role", "")
                if role in ("", "forward", "backward"):
                    coords = [[pt["lon"], pt["lat"]] for pt in member["geometry"]]
                    line_coords.extend(coords)

            elif member["type"] == "node" and member.get("role") in ("stop", "stop_entry_only", "stop_exit_only"):
                # ノードのジオメトリ
                if "lon" in member and "lat" in member:
                    lon, lat = member["lon"], member["lat"]
                elif "geometry" in member:
                    # 一部のOverpassレスポンスではgeometryにlat/lonが入る
                    continue
                else:
                    continue

                station_id = f"station-{member['ref']}"
                station_ids.append(station_id)

                if station_id not in all_stations:
                    all_stations[station_id] = {
                        "id": station_id,
                        "name": {"kanji": "", "hiragana": "", "katakana": "", "romaji": ""},
                        "lat": lat,
                        "lng": lon,
                        "lineIds": [line_id],
                    }
                else:
                    if line_id not in all_stations[station_id]["lineIds"]:
                        all_stations[station_id]["lineIds"].append(line_id)

        if not line_coords:
            continue

        if len(line_coords) >= 2:
            line_features.append({
                "type": "Feature",
                "properties": {
                    "id": line_id,
                    "name": name,
                    "operator": operator_key,
                    "color": color,
                },
                "geometry": {"type": "LineString", "coordinates": line_coords},
            })

        lines_data.append({
            "id": line_id,
            "name": {"kanji": name, "hiragana": "", "katakana": "", "romaji": ""},
            "operator": operator_key,
            "color": color,
            "stationIds": station_ids,
        })

    # 駅名を別クエリで取得（out geom ではノードタグが取れないことがある）
    print("  駅名を取得中...")
    time.sleep(REQUEST_INTERVAL)
    station_query = """
    [out:json][timeout:120];
    (
      node["railway"="station"](35.0,138.8,36.1,140.2);
      node["railway"="halt"](35.0,138.8,36.1,140.2);
    );
    out tags;
    """
    station_result = overpass_query(station_query)

    # ノードID→タグのマップ
    station_tags_map: dict[int, dict[str, str]] = {}
    for elem in station_result["elements"]:
        if elem["type"] == "node":
            station_tags_map[elem["id"]] = elem.get("tags", {})

    # 駅名を設定
    for sid, st in all_stations.items():
        nid = int(sid.replace("station-", ""))
        if nid in station_tags_map:
            tags = station_tags_map[nid]
            st["name"]["kanji"] = tags.get("name", f"駅-{nid}")
            st["name"]["hiragana"] = tags.get("name:ja_rm", tags.get("name:ja-Hira", ""))
            st["name"]["romaji"] = tags.get("name:en", tags.get("name:ja_rm", ""))
        if not st["name"]["kanji"]:
            st["name"]["kanji"] = f"駅-{nid}"

    # GeoJSON
    station_features = []
    for st in all_stations.values():
        station_features.append({
            "type": "Feature",
            "properties": {
                "id": st["id"],
                "name": st["name"]["kanji"],
                "lineIds": st["lineIds"],
            },
            "geometry": {"type": "Point", "coordinates": [st["lng"], st["lat"]]},
        })

    save_json(
        {"type": "FeatureCollection", "features": line_features},
        os.path.join(DATA_DIR, "geojson", "rail_lines.geojson"),
    )
    save_json(
        {"type": "FeatureCollection", "features": station_features},
        os.path.join(DATA_DIR, "geojson", "stations.geojson"),
    )
    save_json(lines_data, os.path.join(DATA_DIR, "lines", "lines.json"))
    save_json(list(all_stations.values()), os.path.join(DATA_DIR, "stations", "stations.json"))
    print(f"  {len(lines_data)} 路線, {len(all_stations)} 駅を収集")


# ============================================================
# 4. 主要河川
# ============================================================
TOKYO_RIVERS = [
    "多摩川", "荒川", "隅田川", "神田川", "目黒川",
    "石神井川", "善福寺川", "妙正寺川", "呑川",
    "江戸川", "中川", "綾瀬川", "新河岸川",
    "仙川", "野川", "浅川", "秋川",
]


def collect_rivers() -> None:
    print("\n[4/6] 河川データを収集中...")
    # 東京周辺の河川をname指定で取得
    name_filter = "|".join(TOKYO_RIVERS)
    query = f"""
    [out:json][timeout:180];
    (
      way["waterway"="river"]["name"~"^({name_filter})$"](34.5,138.5,36.5,140.5);
      relation["waterway"="river"]["name"~"^({name_filter})$"](34.5,138.5,36.5,140.5);
    );
    out geom;
    """
    result = overpass_query(query)

    features = []
    rivers_meta: list[dict[str, Any]] = []
    seen_names: set[str] = set()

    for elem in result["elements"]:
        tags = elem.get("tags", {})
        name = tags.get("name", "")
        if not name:
            continue

        if elem["type"] == "way" and "geometry" in elem:
            coords = [[pt["lon"], pt["lat"]] for pt in elem["geometry"]]
            if len(coords) >= 2:
                features.append({
                    "type": "Feature",
                    "properties": {"id": f"river-{elem['id']}", "name": name},
                    "geometry": {"type": "LineString", "coordinates": coords},
                })

        elif elem["type"] == "relation":
            for member in elem.get("members", []):
                if member["type"] == "way" and "geometry" in member:
                    coords = [[pt["lon"], pt["lat"]] for pt in member["geometry"]]
                    if len(coords) >= 2:
                        features.append({
                            "type": "Feature",
                            "properties": {"id": f"river-{member['ref']}", "name": name},
                            "geometry": {"type": "LineString", "coordinates": coords},
                        })

        if name not in seen_names:
            seen_names.add(name)
            rivers_meta.append({
                "id": f"river-{elem['id']}",
                "name": {"kanji": name, "hiragana": "", "katakana": "", "romaji": ""},
            })

    geojson = {"type": "FeatureCollection", "features": features}
    save_json(geojson, os.path.join(DATA_DIR, "geojson", "rivers.geojson"))
    save_json(rivers_meta, os.path.join(DATA_DIR, "rivers.json"))
    print(f"  {len(features)} 河川セグメント, {len(rivers_meta)} 固有河川名を収集")


# ============================================================
# 5. 主要道路
# ============================================================
TOKYO_ROADS_NAMES = [
    "環七通り", "環八通り", "甲州街道", "青梅街道", "明治通り",
    "山手通り", "中央通り", "外堀通り", "靖国通り",
    "新青梅街道", "目白通り", "新目白通り", "春日通り",
    "井の頭通り", "駒沢通り", "尾久橋通り",
]


def collect_roads() -> None:
    print("\n[5/6] 主要道路データを収集中...")
    name_filter = "|".join(TOKYO_ROADS_NAMES)
    query = f"""
    [out:json][timeout:180];
    (
      way["highway"]["name"~"({name_filter})"](35.0,138.9,36.0,140.0);
    );
    out geom;
    """
    result = overpass_query(query)

    features = []
    roads_meta: list[dict[str, Any]] = []
    seen_names: set[str] = set()

    for elem in result["elements"]:
        if elem["type"] != "way":
            continue
        tags = elem.get("tags", {})
        name = tags.get("name", "")
        if not name:
            continue

        if "geometry" in elem:
            coords = [[pt["lon"], pt["lat"]] for pt in elem["geometry"]]
            if len(coords) >= 2:
                features.append({
                    "type": "Feature",
                    "properties": {"id": f"road-{elem['id']}", "name": name},
                    "geometry": {"type": "LineString", "coordinates": coords},
                })
                if name not in seen_names:
                    seen_names.add(name)
                    roads_meta.append({
                        "id": f"road-{elem['id']}",
                        "name": {"kanji": name, "hiragana": "", "katakana": "", "romaji": ""},
                    })

    geojson = {"type": "FeatureCollection", "features": features}
    save_json(geojson, os.path.join(DATA_DIR, "geojson", "roads.geojson"))
    save_json(roads_meta, os.path.join(DATA_DIR, "roads.json"))
    print(f"  {len(features)} 道路セグメント, {len(roads_meta)} 固有道路名を収集")


# ============================================================
# 6. 主要観光地
# ============================================================
def collect_landmarks() -> None:
    print("\n[6/6] 観光地データを収集中...")
    query = """
    [out:json][timeout:120];
    area["name"="東京都"]["admin_level"="4"]->.tokyo;
    (
      node["tourism"~"attraction|museum|viewpoint"]["name"](area.tokyo);
      way["tourism"~"attraction|museum|viewpoint"]["name"](area.tokyo);
      node["historic"]["name"](area.tokyo);
      node["amenity"="place_of_worship"]["name"]["wikidata"](area.tokyo);
    );
    out center;
    """
    result = overpass_query(query)

    landmarks: list[dict[str, Any]] = []
    features = []
    seen: set[str] = set()

    for elem in result["elements"]:
        tags = elem.get("tags", {})
        name = tags.get("name", "")
        if not name or name in seen:
            continue

        lat = elem.get("lat") or elem.get("center", {}).get("lat")
        lon = elem.get("lon") or elem.get("center", {}).get("lon")
        if not lat or not lon:
            continue

        seen.add(name)
        lid = f"landmark-{elem['id']}"

        landmarks.append({
            "id": lid,
            "name": {"kanji": name, "hiragana": "", "katakana": "", "romaji": ""},
            "lat": lat,
            "lng": lon,
            "description": tags.get("description", ""),
        })

        features.append({
            "type": "Feature",
            "properties": {"id": lid, "name": name},
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
        })

    geojson = {"type": "FeatureCollection", "features": features}
    save_json(geojson, os.path.join(DATA_DIR, "geojson", "landmarks.geojson"))
    save_json(landmarks, os.path.join(DATA_DIR, "landmarks.json"))
    print(f"  {len(landmarks)} 観光地を収集")


# ============================================================
# メイン
# ============================================================
def main() -> None:
    print("=" * 60)
    print("Tokyo Master - 地理データ収集")
    print("=" * 60)

    ensure_dir(DATA_DIR)

    collect_ward_boundaries()
    time.sleep(REQUEST_INTERVAL)

    collect_pref_boundaries()
    time.sleep(REQUEST_INTERVAL)

    collect_rail_data()
    time.sleep(REQUEST_INTERVAL)

    collect_rivers()
    time.sleep(REQUEST_INTERVAL)

    collect_roads()
    time.sleep(REQUEST_INTERVAL)

    collect_landmarks()

    print("\n" + "=" * 60)
    print("データ収集完了!")
    print("=" * 60)


if __name__ == "__main__":
    main()
