#!/usr/bin/env python3
"""
路線データを正規化して、事業者→路線名の階層インデックスを生成する。
上り/下り・急行/各停などの重複を統合。
"""

import json
import os
import re
from collections import defaultdict
from typing import Any

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")

# 路線名の正規化ルール
NORMALIZE_PATTERNS = [
    (r"\s*[\(（].*?[\)）]", ""),     # カッコ内を除去
    (r"\s*[:：].*$", ""),            # コロン以降を除去
    (r"\s*(上り|下り|北行|南行|東行|西行)$", ""),
    (r"\s*(各駅停車|急行|快速|準急|特急|通勤準急|普通)$", ""),
    (r"^列車\s*", ""),               # "列車 " prefix
    (r"\s*$", ""),
]

# 表示用の正規化路線名マッピング (手動で整理)
LINE_NAME_MAP: dict[str, str] = {
    "JR東北本線": "JR東北本線",
    "JR常磐線": "常磐線",
    "JR中央線": "中央線",
    "中央・総武緩行線": "中央・総武線各駅停車",
    "湘南新宿ライン": "湘南新宿ライン",
    "京浜東北線・根岸線": "京浜東北・根岸線",
    "東京メトロ丸ノ内線": "丸ノ内線",
    "東京メトロ半蔵門線": "半蔵門線",
    "東京メトロ半蔵門線 - 東急田園都市線直通運転": "半蔵門線",
    "東京メトロ半蔵門線 - 東急田園都市線 - 東武スカイツリーライン直通運転": "半蔵門線",
    "都営大江戸線": "都営大江戸線",
    "都営三田線": "都営三田線",
    "都営新宿線": "都営新宿線",
    "都営浅草線": "都営浅草線",
    "東急田園都市線": "東急田園都市線",
    "東急東横線": "東急東横線",
    "東急大井町線": "東急大井町線",
    "東急池上線": "東急池上線",
    "東急目黒線": "東急目黒線",
    "東急世田谷線": "東急世田谷線",
    "東急多摩川線": "東急多摩川線",
    "京王線": "京王線",
    "京王電鉄井の頭線": "京王井の頭線",
    "京王電鉄井の頭線急行": "京王井の頭線",
    "京王電鉄相模原線": "京王相模原線",
    "高尾線": "京王高尾線",
    "京王電鉄動物園線": "京王動物園線",
    "京王電鉄競馬場線": "京王競馬場線",
    "小田急電鉄小田原線": "小田急小田原線",
    "小田急江ノ島線": "小田急江ノ島線",
    "小田急電鉄多摩線": "小田急多摩線",
    "小田急電鉄 千代田線直通列車": "小田急小田原線",
    "小田急電鉄 通勤準急": "小田急小田原線",
    "西武新宿線": "西武新宿線",
    "西武拝島線": "西武拝島線",
    "西武多摩川線": "西武多摩川線",
    "西武多摩湖線": "西武多摩湖線",
    "西武国分寺線": "西武国分寺線",
    "京浜急行電鉄本線": "京急本線",
    "京浜急行電鉄空港線": "京急空港線",
    "京浜急行電鉄久里浜線": "京急久里浜線",
    "京浜急行電鉄大師線": "京急大師線",
    "京浜急行電鉄逗子線": "京急逗子線",
    "東武アーバンパークライン": "東武アーバンパークライン",
    "東武日光線": "東武日光線",
    "東武越生線": "東武越生線",
    "つくばエクスプレス線上り": "つくばエクスプレス",
    "つくばエクスプレス線下り": "つくばエクスプレス",
    "京成電鉄 京成本線": "京成本線",
    "京成電鉄 京成本線 快速": "京成本線",
    "京成松戸線": "京成新京成線",
    "京成千葉線": "京成千葉線",
    "京成千原線": "京成千原線",
    "ゆりかもめ": "ゆりかもめ",
    "りんかい線": "りんかい線",
    "多摩モノレール": "多摩モノレール",
}


def normalize_line_name(name: str) -> str:
    """路線名を正規化"""
    # まず手動マッピングをチェック
    for key, value in LINE_NAME_MAP.items():
        if key in name:
            return value

    # パターンで正規化
    result = name
    for pattern, replacement in NORMALIZE_PATTERNS:
        result = re.sub(pattern, replacement, result)
    return result.strip()


def build_index() -> None:
    with open(os.path.join(DATA_DIR, "lines", "lines.json"), encoding="utf-8") as f:
        lines: list[dict[str, Any]] = json.load(f)

    with open(os.path.join(DATA_DIR, "stations", "stations.json"), encoding="utf-8") as f:
        stations: list[dict[str, Any]] = json.load(f)

    station_map = {s["id"]: s for s in stations}

    # 路線名→統合データ
    grouped: dict[str, dict[str, Any]] = {}

    for line in lines:
        raw_name = line["name"]["kanji"]
        norm_name = normalize_line_name(raw_name)
        operator = line["operator"]
        color = line["color"]
        line_id = line["id"]
        station_ids = line["stationIds"]

        key = f"{operator}::{norm_name}"

        if key not in grouped:
            grouped[key] = {
                "name": norm_name,
                "operator": operator,
                "color": color,
                "lineIds": [],
                "stationIds": set(),
            }

        grouped[key]["lineIds"].append(line_id)
        grouped[key]["stationIds"].update(station_ids)
        # 色は最初のものを使用（通常同じ）
        if color != "#888888":
            grouped[key]["color"] = color

    # stationIds を順序付きリストに変換
    index_data: list[dict[str, Any]] = []
    for key, data in sorted(grouped.items()):
        station_list = []
        for sid in data["stationIds"]:
            if sid in station_map:
                s = station_map[sid]
                station_list.append({
                    "id": sid,
                    "name": s["name"]["kanji"],
                    "lat": s["lat"],
                    "lng": s["lng"],
                })

        index_data.append({
            "key": key,
            "name": data["name"],
            "operator": data["operator"],
            "color": data["color"],
            "lineIds": data["lineIds"],
            "stations": station_list,
        })

    # 事業者ごとの要約も出力
    by_operator: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in index_data:
        by_operator[item["operator"]].append({
            "key": item["key"],
            "name": item["name"],
            "color": item["color"],
            "lineIds": item["lineIds"],
            "stationCount": len(item["stations"]),
        })

    output = {
        "lines": index_data,
        "byOperator": dict(by_operator),
    }

    outpath = os.path.join(DATA_DIR, "lines", "line_index.json")
    with open(outpath, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"Saved: {outpath}")
    print(f"Total grouped lines: {len(index_data)}")
    for op, items in sorted(by_operator.items()):
        print(f"  {op}: {len(items)} lines")
        for item in items:
            print(f"    {item['name']} ({item['stationCount']} stations)")


if __name__ == "__main__":
    build_index()
