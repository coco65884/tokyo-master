#!/usr/bin/env python3
"""
路線の駅を公式駅番号順にソートする。
方法: 各路線の始発駅を定義し、そこから最近傍を辿るgreedy TSPで順序を決定。
環状線（山手線、大江戸線）は始発駅に戻るまで辿る。
"""

import json
import math
import os
from typing import Any

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")

# 路線ごとの始発駅名（公式駅番号01の駅）
# 未指定の路線は緯度経度で端の駅を自動検出
START_STATIONS: dict[str, str] = {
    # JR
    "山手線": "東京",
    "中央線快速": "東京",
    "中央・総武線各駅停車": "三鷹",
    "京浜東北線": "大宮",
    "東海道線": "東京",
    "横須賀・総武快速線": "久里浜",
    "埼京線": "大崎",
    "湘南新宿ライン": "宇都宮",
    "京葉線": "東京",
    "武蔵野線": "府中本町",
    "南武線": "川崎",
    "横浜線": "東神奈川",
    "常磐線快速": "品川",
    "常磐線各駅停車": "綾瀬",
    "青梅線": "立川",
    "五日市線": "拝島",
    "八高線": "八王子",
    "宇都宮線": "上野",
    "高崎線": "上野",
    "相模線": "茅ケ崎",
    # メトロ
    "銀座線": "渋谷",
    "丸ノ内線": "荻窪",
    "日比谷線": "中目黒",
    "東西線": "中野",
    "千代田線": "代々木上原",
    "有楽町線": "和光市",
    "半蔵門線": "渋谷",
    "南北線": "目黒",
    "副都心線": "和光市",
    # 都営
    "都営浅草線": "西馬込",
    "都営三田線": "目黒",
    "都営新宿線": "新宿",
    "都営大江戸線": "都庁前",
    "日暮里・舎人ライナー": "日暮里",
    # 京王
    "京王線": "新宿",
    "京王井の頭線": "渋谷",
    "京王相模原線": "調布",
    # 小田急
    "小田急小田原線": "新宿",
    "小田急江ノ島線": "相模大野",
    "小田急多摩線": "新百合ヶ丘",
    # 東急
    "東急東横線": "渋谷",
    "東急田園都市線": "渋谷",
    "東急目黒線": "目黒",
    "東急大井町線": "大井町",
    "東急池上線": "五反田",
    "東急多摩川線": "多摩川",
    "東急世田谷線": "三軒茶屋",
    "東急こどもの国線": "長津田",
    # 西武
    "西武新宿線": "西武新宿",
    "西武池袋線": "池袋",
    "西武拝島線": "小平",
    "西武多摩川線": "武蔵境",
    "西武園線": "東村山",
    # 京急
    "京急本線": "泉岳寺",
    "京急空港線": "京急蒲田",
    "京急久里浜線": "堀ノ内",
    "京急大師線": "京急川崎",
    "京急逗子線": "金沢八景",
    # 東武
    "東武スカイツリーライン": "浅草",
    "東武アーバンパークライン": "大宮",
    "東武亀戸線": "亀戸",
    "東武大師線": "大師前",
    "東武越生線": "坂戸",
    "東武東上線": "池袋",
    # TX
    "つくばエクスプレス": "秋葉原",
    # 京成
    "京成本線": "京成上野",
    "京成押上線": "押上",
    "京成千葉線": "京成津田沼",
    "京成千原線": "千葉中央",
    "京成金町線": "京成高砂",
    "新京成線": "京成津田沼",
    # ゆりかもめ
    "ゆりかもめ": "新橋",
    # りんかい線
    "りんかい線": "新木場",
    # 多摩モノレール
    "多摩モノレール": "多摩センター",
}

# 環状線
LOOP_LINES = {"山手線", "都営大江戸線"}


def distance(s1: dict, s2: dict) -> float:
    dlat = s1["lat"] - s2["lat"]
    dlng = s1["lng"] - s2["lng"]
    return math.sqrt(dlat ** 2 + dlng ** 2)


def find_start_station(stations: list[dict], start_name: str) -> int:
    """始発駅のインデックスを探す（部分一致）"""
    for i, s in enumerate(stations):
        if s["name"] == start_name:
            return i
    # 部分一致
    for i, s in enumerate(stations):
        if start_name in s["name"] or s["name"] in start_name:
            return i
    return -1


def sort_greedy(stations: list[dict], start_idx: int) -> list[dict]:
    """始発駅から最近傍を辿って順序を決定"""
    if not stations:
        return []

    result = [stations[start_idx]]
    remaining = [s for i, s in enumerate(stations) if i != start_idx]

    while remaining:
        current = result[-1]
        nearest_idx = min(range(len(remaining)), key=lambda i: distance(current, remaining[i]))
        result.append(remaining.pop(nearest_idx))

    return result


def auto_find_endpoint(stations: list[dict]) -> int:
    """最も端にある駅（他の駅からの平均距離が最大）を始発とする"""
    if len(stations) <= 1:
        return 0

    max_avg_dist = -1
    best_idx = 0
    for i, s in enumerate(stations):
        avg_dist = sum(distance(s, other) for j, other in enumerate(stations) if j != i) / (len(stations) - 1)
        if avg_dist > max_avg_dist:
            max_avg_dist = avg_dist
            best_idx = i
    return best_idx


def main() -> None:
    path = os.path.join(DATA_DIR, "lines", "line_index.json")
    with open(path, encoding="utf-8") as f:
        idx = json.load(f)

    sorted_count = 0

    for line in idx["lines"]:
        stations = line["stations"]
        if len(stations) <= 1:
            continue

        name = line["name"]
        start_name = START_STATIONS.get(name)

        if start_name:
            start_idx = find_start_station(stations, start_name)
            if start_idx < 0:
                print(f"  WARNING: {name} - 始発駅 '{start_name}' が見つかりません")
                start_idx = auto_find_endpoint(stations)
        else:
            start_idx = auto_find_endpoint(stations)

        sorted_stations = sort_greedy(stations, start_idx)
        line["stations"] = sorted_stations
        sorted_count += 1

    # byOperator の stationCount も更新
    for op, entries in idx["byOperator"].items():
        for entry in entries:
            matching = next((l for l in idx["lines"] if l["key"] == entry["key"]), None)
            if matching:
                entry["stationCount"] = len(matching["stations"])

    with open(path, "w", encoding="utf-8") as f:
        json.dump(idx, f, ensure_ascii=False, indent=2)
    print(f"Sorted {sorted_count} lines")

    # publicにコピー
    import shutil
    pub_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data", "line_index.json")
    shutil.copy(path, pub_path)
    print(f"Copied to {pub_path}")

    # 検証: 山手線の順序
    yamanote = next(l for l in idx["lines"] if l["name"] == "山手線")
    print(f"\n山手線 ({len(yamanote['stations'])}駅):")
    for i, s in enumerate(yamanote["stations"]):
        print(f"  JY{i+1:02d} {s['name']}")


if __name__ == "__main__":
    main()
