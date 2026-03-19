#!/usr/bin/env python3
"""
欠損・誤データの路線を修正する。
- 副都心線: 完全に誤ったデータ → 正しい駅に置換
- 丸ノ内線/大江戸線: 重複駅を除去
- りんかい線/多摩モノレール: 駅を手動追加
"""

import json
import os
import math
import shutil
import urllib.request
import urllib.parse
import time
from typing import Any

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")
OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def overpass_query(query: str) -> dict[str, Any]:
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    req = urllib.request.Request(OVERPASS_URL, data=data, headers={"User-Agent": "TokyoMaster/1.0"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            print(f"  Retry {attempt+1}: {e}")
            if attempt < 2: time.sleep(10)
    raise RuntimeError("Query failed")


def get_station_coords(names: list[str], bbox: str = "35.5,139.0,36.0,140.0") -> dict[str, dict]:
    """OSMから駅名で正確な座標を取得"""
    name_filter = "|".join(names)
    query = f'''
    [out:json][timeout:60];
    node["railway"="station"]["name"~"^({name_filter})$"]({bbox});
    out;
    '''
    result = overpass_query(query)
    coords = {}
    for elem in result["elements"]:
        name = elem.get("tags", {}).get("name", "")
        if name and name not in coords:
            coords[name] = {"lat": elem["lat"], "lng": elem["lon"]}
    return coords


# 副都心線の正しい駅リスト
FUKUTOSHIN_STATIONS = [
    "和光市", "地下鉄成増", "地下鉄赤塚", "平和台", "氷川台",
    "小竹向原", "千川", "要町", "池袋", "雑司が谷",
    "西早稲田", "東新宿", "新宿三丁目", "北参道", "明治神宮前〈原宿〉", "渋谷",
]

# りんかい線
RINKAI_STATIONS = [
    "新木場", "東雲", "国際展示場", "東京テレポート",
    "天王洲アイル", "品川シーサイド", "大井町", "大崎",
]

# 多摩モノレール
TAMA_MONO_STATIONS = [
    "多摩センター", "松が谷", "大塚・帝京大学", "中央大学・明星大学",
    "多摩動物公園", "程久保", "高幡不動", "万願寺", "甲州街道",
    "柴崎体育館", "立川南", "立川北", "高松", "立飛",
    "泉体育館", "砂川七番", "玉川上水", "桜街道", "上北台",
]


def main() -> None:
    path = os.path.join(DATA_DIR, "lines", "line_index.json")
    with open(path, encoding="utf-8") as f:
        idx = json.load(f)

    # 1. 副都心線を修正
    print("副都心線を修正中...")
    coords = get_station_coords(FUKUTOSHIN_STATIONS, "35.5,139.0,36.0,140.0")
    fuku_data = []
    for name in FUKUTOSHIN_STATIONS:
        c = coords.get(name)
        if c:
            fuku_data.append({"id": f"station-fuku-{name}", "name": name, "lat": c["lat"], "lng": c["lng"]})
        else:
            print(f"  WARNING: {name} not found")
    for line in idx["lines"]:
        if "副都心" in line["name"]:
            line["stations"] = fuku_data
            print(f"  副都心線: {len(fuku_data)}駅")
            break

    time.sleep(5)

    # 2. りんかい線を追加
    print("りんかい線を修正中...")
    coords = get_station_coords(RINKAI_STATIONS)
    rinkai_data = []
    for name in RINKAI_STATIONS:
        c = coords.get(name)
        if c:
            rinkai_data.append({"id": f"station-rinkai-{name}", "name": name, "lat": c["lat"], "lng": c["lng"]})
        else:
            print(f"  WARNING: {name} not found")
    for line in idx["lines"]:
        if "りんかい" in line["name"]:
            line["stations"] = rinkai_data
            print(f"  りんかい線: {len(rinkai_data)}駅")
            break

    time.sleep(5)

    # 3. 多摩モノレールを追加
    print("多摩モノレールを修正中...")
    coords = get_station_coords(TAMA_MONO_STATIONS, "35.5,139.2,35.8,139.5")
    tama_data = []
    for name in TAMA_MONO_STATIONS:
        c = coords.get(name)
        if c:
            tama_data.append({"id": f"station-tama-{name}", "name": name, "lat": c["lat"], "lng": c["lng"]})
        else:
            print(f"  WARNING: {name} not found")
    for line in idx["lines"]:
        if "多摩モノレール" in line["name"]:
            line["stations"] = tama_data
            print(f"  多摩モノレール: {len(tama_data)}駅")
            break

    # 4. 重複駅を除去（丸ノ内線、大江戸線等）
    print("重複駅を除去中...")
    for line in idx["lines"]:
        seen = {}
        deduped = []
        for s in line["stations"]:
            key = f"{s['name']}_{round(s['lat']*100)}_{round(s['lng']*100)}"
            if key not in seen:
                seen[key] = True
                deduped.append(s)
        if len(deduped) < len(line["stations"]):
            removed = len(line["stations"]) - len(deduped)
            print(f"  {line['name']}: {removed}重複除去 ({len(line['stations'])}→{len(deduped)})")
            line["stations"] = deduped

    # byOperator更新
    for op, entries in idx["byOperator"].items():
        for entry in entries:
            matching = next((l for l in idx["lines"] if l["key"] == entry["key"]), None)
            if matching:
                entry["stationCount"] = len(matching["stations"])

    with open(path, "w", encoding="utf-8") as f:
        json.dump(idx, f, ensure_ascii=False, indent=2)
    shutil.copy(path, os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data", "line_index.json"))
    print("\n保存完了")


if __name__ == "__main__":
    main()
