#!/usr/bin/env python3
"""
路線マスターに基づいてline_indexを再構築する。
- 公式カラー・略称を設定
- 同一路線の統合（上り下り、快速各停、直通運転等）
- 特急等の学習に不要な路線を除外
"""

import json
import os
from collections import defaultdict
from typing import Any

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")

# ============================================================
# 路線マスター定義
# name: 表示名, abbr: 公式略称, color: 公式カラー,
# merge_patterns: 統合対象の既存路線名パターン(部分一致)
# ============================================================
LINE_MASTER: list[dict[str, Any]] = [
    # === JR ===
    {"name": "山手線", "abbr": "JY", "color": "#9acd32", "operator": "JR",
     "merge": ["JR山手線"]},
    {"name": "中央線快速", "abbr": "JC", "color": "#f15a22", "operator": "JR",
     "merge": ["中央線", "東京地下鉄の直通運転 - 中央線"]},
    {"name": "中央・総武線各駅停車", "abbr": "JB", "color": "#ffd400", "operator": "JR",
     "merge": ["中央・総武線各駅停車"]},
    {"name": "京浜東北線", "abbr": "JK", "color": "#00b2e5", "operator": "JR",
     "merge": ["JR京浜東北線", "JR根岸線"]},
    {"name": "東海道線", "abbr": "JT", "color": "#f68b1e", "operator": "JR",
     "merge": ["JR東北本線", "東北本線", "上野東京ライン"]},
    {"name": "横須賀・総武快速線", "abbr": "JO", "color": "#0067c0", "operator": "JR",
     "merge": ["横須賀・総武快速線", "JR総武快速線", "横須賀線", "総武本線"]},
    {"name": "埼京線", "abbr": "JA", "color": "#00ac9a", "operator": "JR",
     "merge": ["JR埼京線"]},
    {"name": "湘南新宿ライン", "abbr": "JS", "color": "#e5560d", "operator": "JR",
     "merge": ["湘南新宿ライン", "南新宿ライン"]},
    {"name": "京葉線", "abbr": "JE", "color": "#c9252f", "operator": "JR",
     "merge": ["JR京葉線", "京葉線"]},
    {"name": "武蔵野線", "abbr": "JM", "color": "#f15a22", "operator": "JR",
     "merge": ["JR武蔵野線"]},
    {"name": "南武線", "abbr": "JN", "color": "#ffd400", "operator": "JR",
     "merge": ["JR南武線", "JR南武線浜川崎支線"]},
    {"name": "横浜線", "abbr": "JH", "color": "#7fc342", "operator": "JR",
     "merge": ["JR横浜線"]},
    {"name": "常磐線快速", "abbr": "JJ", "color": "#007b43", "operator": "JR",
     "merge": ["常磐線", "常磐快速線", "東京地下鉄の直通運転 - 常磐線"]},
    {"name": "常磐線各駅停車", "abbr": "JL", "color": "#88bf62", "operator": "JR",
     "merge": ["JR常磐緩行線", "常磐緩行線"]},
    {"name": "青梅線", "abbr": "JC", "color": "#f15a22", "operator": "JR",
     "merge": ["JR青梅線"]},
    {"name": "五日市線", "abbr": "JC", "color": "#f15a22", "operator": "JR",
     "merge": ["JR五日市線"]},
    {"name": "八高線", "abbr": "JC", "color": "#7fc342", "operator": "JR",
     "merge": ["八高線"]},
    {"name": "宇都宮線", "abbr": "JU", "color": "#f68b1e", "operator": "JR",
     "merge": ["JR宇都宮線"]},
    {"name": "高崎線", "abbr": "JU", "color": "#f68b1e", "operator": "JR",
     "merge": ["高崎線"]},
    {"name": "相模線", "abbr": "JR", "color": "#7fc342", "operator": "JR",
     "merge": ["相模線"]},

    # === 東京メトロ ===
    {"name": "銀座線", "abbr": "G", "color": "#f39700", "operator": "Metro",
     "merge": ["東京メトロ銀座線"]},
    {"name": "丸ノ内線", "abbr": "M", "color": "#e60012", "operator": "Metro",
     "merge": ["丸ノ内線"]},
    {"name": "日比谷線", "abbr": "H", "color": "#9caeb7", "operator": "Metro",
     "merge": ["東京メトロ日比谷線"]},
    {"name": "東西線", "abbr": "T", "color": "#00a7db", "operator": "Metro",
     "merge": ["東京メトロ東西線", "東京メトロ東西線 通勤"]},
    {"name": "千代田線", "abbr": "C", "color": "#00a650", "operator": "Metro",
     "merge": ["千代田線"]},
    {"name": "有楽町線", "abbr": "Y", "color": "#c1a470", "operator": "Metro",
     "merge": ["西武有楽町・池袋線", "東京地下鉄の直通運転 - 西武池袋線", "東京地下鉄の直通運転 - 飯能線"]},
    {"name": "半蔵門線", "abbr": "Z", "color": "#9b7cb6", "operator": "Metro",
     "merge": ["半蔵門線", "東京地下鉄の直通運転 - スカイツリーライン"]},
    {"name": "南北線", "abbr": "N", "color": "#00ada9", "operator": "Metro",
     "merge": ["東京地下鉄-目黒線"]},
    {"name": "副都心線", "abbr": "F", "color": "#bb641d", "operator": "Metro",
     "merge": ["東京地下鉄の直通運転 - 多摩線"]},

    # === 都営 ===
    {"name": "都営浅草線", "abbr": "A", "color": "#e85298", "operator": "Toei",
     "merge": ["都営浅草線"]},
    {"name": "都営三田線", "abbr": "I", "color": "#0079c2", "operator": "Toei",
     "merge": ["都営三田線"]},
    {"name": "都営新宿線", "abbr": "S", "color": "#6cbb5a", "operator": "Toei",
     "merge": ["都営新宿線"]},
    {"name": "都営大江戸線", "abbr": "E", "color": "#b6007a", "operator": "Toei",
     "merge": ["都営大江戸線"]},
    {"name": "日暮里・舎人ライナー", "abbr": "NT", "color": "#f25192", "operator": "Toei",
     "merge": ["日暮里・舎人ライナー"]},

    # === 京王 ===
    {"name": "京王線", "abbr": "KO", "color": "#dd0077", "operator": "Keio",
     "merge": ["京王線", "京王高尾線", "京王動物園線", "京王競馬場線"]},
    {"name": "京王井の頭線", "abbr": "IN", "color": "#1d2088", "operator": "Keio",
     "merge": ["京王井の頭線"]},
    {"name": "京王相模原線", "abbr": "KO", "color": "#dd0077", "operator": "Keio",
     "merge": ["京王相模原線"]},

    # === 小田急 ===
    {"name": "小田急小田原線", "abbr": "OH", "color": "#0078c8", "operator": "Odakyu",
     "merge": ["小田急小田原線", "Stopping service", "小田急通勤", "小田急小田原線・江ノ島線 快速"]},
    {"name": "小田急江ノ島線", "abbr": "OE", "color": "#0078c8", "operator": "Odakyu",
     "merge": ["小田急江ノ島線"]},
    {"name": "小田急多摩線", "abbr": "OT", "color": "#0078c8", "operator": "Odakyu",
     "merge": ["小田急多摩線"]},

    # === 東急 ===
    {"name": "東急東横線", "abbr": "TY", "color": "#da0442", "operator": "Tokyu",
     "merge": ["東急東横線"]},
    {"name": "東急田園都市線", "abbr": "DT", "color": "#00a040", "operator": "Tokyu",
     "merge": ["東急田園都市線"]},
    {"name": "東急目黒線", "abbr": "MG", "color": "#009cd2", "operator": "Tokyu",
     "merge": ["東急目黒線", "東急新横浜線"]},
    {"name": "東急大井町線", "abbr": "OM", "color": "#f18c43", "operator": "Tokyu",
     "merge": ["東急大井町線"]},
    {"name": "東急池上線", "abbr": "IK", "color": "#ee86a7", "operator": "Tokyu",
     "merge": ["東急池上線"]},
    {"name": "東急多摩川線", "abbr": "TM", "color": "#ae0378", "operator": "Tokyu",
     "merge": ["東急多摩川線"]},
    {"name": "東急世田谷線", "abbr": "SG", "color": "#ffdd00", "operator": "Tokyu",
     "merge": ["東急電鉄世田谷線", "東急電鉄世田谷線 三軒茶屋→下高井戸"]},
    {"name": "東急こどもの国線", "abbr": "KD", "color": "#009cd2", "operator": "Tokyu",
     "merge": ["東急こどもの国線"]},

    # === 西武 ===
    {"name": "西武新宿線", "abbr": "SS", "color": "#00498b", "operator": "Seibu",
     "merge": ["西武新宿線", "拝島ライナー"]},
    {"name": "西武池袋線", "abbr": "SI", "color": "#00498b", "operator": "Seibu",
     "merge": ["小江戸", "S-Train"]},
    {"name": "西武拝島線", "abbr": "SS", "color": "#00498b", "operator": "Seibu",
     "merge": ["西武拝島線"]},
    {"name": "西武多摩川線", "abbr": "SW", "color": "#00498b", "operator": "Seibu",
     "merge": ["西武多摩川線"]},
    {"name": "西武園線", "abbr": "SK", "color": "#00498b", "operator": "Seibu",
     "merge": ["西武園線"]},

    # === 京急 ===
    {"name": "京急本線", "abbr": "KK", "color": "#e8334a", "operator": "Keikyu",
     "merge": ["京急本線", "京急空港線•本線•逗子線", "京急逗子線•本線•空港線"]},
    {"name": "京急空港線", "abbr": "KK", "color": "#e8334a", "operator": "Keikyu",
     "merge": ["京急空港線"]},
    {"name": "京急久里浜線", "abbr": "KK", "color": "#e8334a", "operator": "Keikyu",
     "merge": ["京急久里浜線"]},
    {"name": "京急大師線", "abbr": "KK", "color": "#e8334a", "operator": "Keikyu",
     "merge": ["京急大師線"]},
    {"name": "京急逗子線", "abbr": "KK", "color": "#e8334a", "operator": "Keikyu",
     "merge": ["逗子線"]},

    # === 東武 ===
    {"name": "東武スカイツリーライン", "abbr": "TS", "color": "#0f378e", "operator": "Tobu",
     "merge": ["東武日光線"]},
    {"name": "東武アーバンパークライン", "abbr": "TD", "color": "#0f378e", "operator": "Tobu",
     "merge": ["東武アーバンパークライン"]},
    {"name": "東武亀戸線", "abbr": "TS", "color": "#0f378e", "operator": "Tobu",
     "merge": ["東武鉄道亀戸線"]},
    {"name": "東武大師線", "abbr": "TS", "color": "#0f378e", "operator": "Tobu",
     "merge": ["東武大師線", "東武鉄道大師線"]},
    {"name": "東武越生線", "abbr": "TJ", "color": "#0f378e", "operator": "Tobu",
     "merge": ["東武越生線"]},

    # === TX ===
    {"name": "つくばエクスプレス", "abbr": "TX", "color": "#2e3192", "operator": "TX",
     "merge": ["つくばエクスプレス"]},

    # === 京成 ===
    {"name": "京成本線", "abbr": "KS", "color": "#003399", "operator": "Keisei",
     "merge": ["京成本線", "京成本線・千葉線", "京成本線・千葉線・千原線", "京成スカイライナー", "京成成田空港アクセス"]},
    {"name": "京成押上線", "abbr": "KS", "color": "#003399", "operator": "Keisei",
     "merge": ["京成電鉄 押上線"]},
    {"name": "京成千葉線", "abbr": "KS", "color": "#003399", "operator": "Keisei",
     "merge": ["京成電鉄 千葉線"]},
    {"name": "京成千原線", "abbr": "KS", "color": "#003399", "operator": "Keisei",
     "merge": ["京成電鉄 千原線"]},
    {"name": "京成金町線", "abbr": "KS", "color": "#003399", "operator": "Keisei",
     "merge": ["京成電鉄 金町線"]},
    {"name": "新京成線", "abbr": "SL", "color": "#e8689b", "operator": "Keisei",
     "merge": ["京成新京成線"]},

    # === ゆりかもめ ===
    {"name": "ゆりかもめ", "abbr": "U", "color": "#009fa1", "operator": "Yurikamome",
     "merge": ["ゆりかもめ"]},

    # === りんかい線 ===
    {"name": "りんかい線", "abbr": "R", "color": "#00b5ad", "operator": "TWR",
     "merge": ["りんかい線"]},

    # === 多摩モノレール ===
    {"name": "多摩モノレール", "abbr": "TT", "color": "#f25192", "operator": "TamaMonorail",
     "merge": ["多摩モノレール"]},
]

# 除外する路線名パターン（特急、新幹線等）
EXCLUDE_PATTERNS = [
    "あずさ", "特急あずさ", "ひたち", "しおさい", "さざなみ",
    "きぬがわ", "たにがわ", "つばさ", "とき",
    "東北新幹線", "JR成田エクスプレス", "JR成田線", "JR内房線",
    "JR外房線", "久留里線", "JR成田線 我孫子支線",
    "えのしま", "さがみ", "はこね", "ふじさん", "スーパーはこね",
    "エアポート快特", "京成電鉄 シテイライナー",
    "小田急小田原線", "東急田園都市線", "都営浅草線",  # Metro下の直通重複
    "西武安比奈線",
]


def main() -> None:
    with open(os.path.join(DATA_DIR, "lines", "line_index.json"), encoding="utf-8") as f:
        old_index = json.load(f)

    old_lines = old_index["lines"]
    old_by_key = {l["key"]: l for l in old_lines}

    new_lines: list[dict[str, Any]] = []
    used_old_keys: set[str] = set()

    for master in LINE_MASTER:
        merged_line_ids: list[str] = []
        merged_stations: dict[str, dict[str, Any]] = {}

        for old_line in old_lines:
            old_name = old_line["name"]
            if any(pat == old_name for pat in master["merge"]):
                used_old_keys.add(old_line["key"])
                merged_line_ids.extend(old_line["lineIds"])
                for s in old_line["stations"]:
                    if s["name"].startswith("駅-"):
                        continue
                    # 名前+近傍グリッド(~100m)で重複排除
                    dedup_key = f"{s['name']}_{round(s['lat'] * 100)}_{round(s['lng'] * 100)}"
                    if dedup_key not in merged_stations:
                        merged_stations[dedup_key] = s

        key = f"{master['operator']}::{master['name']}"
        new_lines.append({
            "key": key,
            "name": master["name"],
            "abbr": master["abbr"],
            "operator": master["operator"],
            "color": master["color"],
            "lineIds": list(set(merged_line_ids)),
            "stations": list(merged_stations.values()),
        })

    # 未使用の路線を確認（除外リストに含まれるもの以外）
    for old_line in old_lines:
        if old_line["key"] in used_old_keys:
            continue
        excluded = any(pat in old_line["name"] for pat in EXCLUDE_PATTERNS)
        if not excluded and old_line["stations"]:
            print(f"  未統合: {old_line['key']}: {old_line['name']} ({len(old_line['stations'])}st)")

    # byOperator を再構築
    by_operator: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for line in new_lines:
        by_operator[line["operator"]].append({
            "key": line["key"],
            "name": line["name"],
            "abbr": line["abbr"],
            "color": line["color"],
            "lineIds": line["lineIds"],
            "stationCount": len(line["stations"]),
        })

    output = {
        "lines": new_lines,
        "byOperator": dict(by_operator),
    }

    outpath = os.path.join(DATA_DIR, "lines", "line_index.json")
    with open(outpath, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\nSaved: {outpath}")
    print(f"Total lines: {len(new_lines)}")
    for op, items in sorted(by_operator.items()):
        print(f"  {op}: {len(items)} lines")

    # publicにコピー
    import shutil
    shutil.copy(outpath, os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data", "line_index.json"))
    print("Copied to public/")

    # ward_objects.json も再構築
    rebuild_ward_objects(new_lines)


def rebuild_ward_objects(new_lines: list[dict[str, Any]]) -> None:
    """ward_objects.json の lineKeys を新しいキーに更新"""
    import json

    wo_path = os.path.join(DATA_DIR, "ward_objects.json")
    with open(wo_path, encoding="utf-8") as f:
        ward_objects = json.load(f)

    # 旧lineId → 新lineKey のマッピング
    lid_to_new_key: dict[str, str] = {}
    for line in new_lines:
        for lid in line["lineIds"]:
            lid_to_new_key[lid] = line["key"]

    # GeoJSONから各路線のlineId一覧を取得
    geo_path = os.path.join(DATA_DIR, "geojson", "rail_lines.geojson")
    with open(geo_path, encoding="utf-8") as f:
        geo = json.load(f)

    with open(os.path.join(DATA_DIR, "geojson", "wards.geojson"), encoding="utf-8") as f:
        wards_geo = json.load(f)

    # 各区のbbox
    ward_bboxes: dict[str, dict[str, float]] = {}
    for feat in wards_geo["features"]:
        wid = feat["properties"]["id"]
        coords_flat: list[list[float]] = []
        def flatten(c: Any) -> None:
            if isinstance(c[0], (int, float)):
                coords_flat.append(c)
            else:
                for sub in c:
                    flatten(sub)
        flatten(feat["geometry"]["coordinates"])
        if coords_flat:
            ward_bboxes[wid] = {
                "minLat": min(c[1] for c in coords_flat),
                "maxLat": max(c[1] for c in coords_flat),
                "minLng": min(c[0] for c in coords_flat),
                "maxLng": max(c[0] for c in coords_flat),
            }

    # lineId → coordinates
    line_coords: dict[str, list[list[float]]] = {}
    for feat in geo["features"]:
        lid = feat["properties"]["id"]
        geom = feat["geometry"]
        if geom["type"] == "LineString":
            line_coords[lid] = geom["coordinates"]
        elif geom["type"] == "MultiLineString":
            flat: list[list[float]] = []
            for seg in geom["coordinates"]:
                flat.extend(seg)
            line_coords[lid] = flat

    def line_intersects_bbox(coords: list[list[float]], bbox: dict[str, float]) -> bool:
        for c in coords:
            if bbox["minLat"] <= c[1] <= bbox["maxLat"] and bbox["minLng"] <= c[0] <= bbox["maxLng"]:
                return True
        return False

    for wid in ward_objects:
        passing_keys: set[str] = set()
        bbox = ward_bboxes.get(wid)
        if not bbox:
            continue
        for line in new_lines:
            for lid in line["lineIds"]:
                if lid in line_coords and line_intersects_bbox(line_coords[lid], bbox):
                    passing_keys.add(line["key"])
                    break
        ward_objects[wid]["lineKeys"] = sorted(passing_keys)

    with open(wo_path, "w", encoding="utf-8") as f:
        json.dump(ward_objects, f, ensure_ascii=False, indent=2)
    print(f"Updated: {wo_path}")

    import shutil
    shutil.copy(wo_path, os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data", "ward_objects.json"))


if __name__ == "__main__":
    main()
