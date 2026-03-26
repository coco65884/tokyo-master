#!/usr/bin/env python3
"""
line_index.json の路線定義を修正する。
Issue #125: 路線の不具合解消

修正内容:
1. 宇都宮線: 重複駅「野木」を削除
2. 都営浅草線: 押上以降の直通運転駅(京成/京急/羽田)を削除
3. 小田急小田原線: 多摩線の駅・江ノ島線の駅・重複駅を削除
4. 小田急江ノ島線: 不要な町田駅を削除
5. 相模線: 重複「北茅ケ崎/北茅ヶ崎」を統一
6. 湘南新宿ライン: 宮原を高崎線区間に移動
7. 常磐線各駅停車: 重複綾瀬を削除、北千住を正しい位置に移動
"""

import json
import os

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")


def find_line(lines: list, key: str) -> dict | None:
    for line in lines:
        if line.get("key") == key:
            return line
    return None


def remove_stations_by_name(line: dict, names: set) -> int:
    """指定名の駅を削除。削除数を返す。"""
    original = len(line["stations"])
    line["stations"] = [s for s in line["stations"] if s["name"] not in names]
    return original - len(line["stations"])


def remove_duplicate_stations(line: dict) -> int:
    """同名の重複駅を削除（最初の1つだけ残す）。"""
    seen = set()
    unique = []
    for s in line["stations"]:
        if s["name"] not in seen:
            seen.add(s["name"])
            unique.append(s)
    removed = len(line["stations"]) - len(unique)
    line["stations"] = unique
    return removed


def main() -> None:
    path = os.path.join(DATA_DIR, "lines", "line_index.json")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    lines = data["lines"]

    # ── 1. 宇都宮線: 重複「野木」削除 ──
    line = find_line(lines, "JR::宇都宮線")
    if line:
        n = remove_duplicate_stations(line)
        print(f"宇都宮線: removed {n} duplicate stations")

    # ── 2. 都営浅草線: 押上以降の直通駅を削除 ──
    line = find_line(lines, "Toei::都営浅草線")
    if line:
        # 押上〈スカイツリー前〉まで残し、それ以降を削除
        oshiage_idx = None
        for i, s in enumerate(line["stations"]):
            if "押上" in s["name"]:
                oshiage_idx = i
                break
        if oshiage_idx is not None:
            removed = len(line["stations"]) - (oshiage_idx + 1)
            line["stations"] = line["stations"][: oshiage_idx + 1]
            # lineIdsも浅草線本体のみに（line-8019849が浅草線本体）
            line["lineIds"] = ["line-8019849"]
            print(f"都営浅草線: removed {removed} through-service stations after 押上")

    # ── 3. 小田急小田原線: 多摩線/江ノ島線の駅・重複削除 ──
    line = find_line(lines, "Odakyu::小田急小田原線")
    if line:
        # 多摩線の駅を削除
        tama_stations = {"五月台", "栗平", "小田急永山", "小田急多摩センター", "唐木田"}
        n1 = remove_stations_by_name(line, tama_stations)

        # 江ノ島線の駅（小田原線の最後に混入）を削除
        enoshima_stations = {"湘南台", "中央林間", "大和", "藤沢"}
        n2 = remove_stations_by_name(line, enoshima_stations)

        # 重複駅を削除
        n3 = remove_duplicate_stations(line)

        print(
            f"小田急小田原線: removed {n1} Tama Line, {n2} Enoshima Line, "
            f"{n3} duplicate stations"
        )

    # ── 4. 小田急江ノ島線: 町田を削除（江ノ島線ではない） ──
    line = find_line(lines, "Odakyu::小田急江ノ島線")
    if line:
        n = remove_stations_by_name(line, {"町田"})
        print(f"小田急江ノ島線: removed {n} wrong stations (町田)")

    # ── 5. 相模線: 重複「北茅ケ崎/北茅ヶ崎」統一 ──
    line = find_line(lines, "JR::相模線")
    if line:
        # 「北茅ケ崎」を削除し「北茅ヶ崎」のみ残す
        line["stations"] = [
            s for s in line["stations"] if s["name"] != "北茅ケ崎"
        ]
        print("相模線: unified 北茅ケ崎/北茅ヶ崎")

    # ── 6. 湘南新宿ライン: 宮原を高崎線区間(上尾の後)に移動 ──
    line = find_line(lines, "JR::湘南新宿ライン")
    if line:
        # 宮原を現在の位置から取り出す
        miyahara = None
        new_stations = []
        for s in line["stations"]:
            if s["name"] == "宮原":
                miyahara = s
            else:
                new_stations.append(s)

        if miyahara:
            # 上尾の直後に挿入
            for i, s in enumerate(new_stations):
                if s["name"] == "上尾":
                    new_stations.insert(i + 1, miyahara)
                    break
            line["stations"] = new_stations
            print("湘南新宿ライン: moved 宮原 after 上尾 in 高崎線 section")

    # ── 7. 常磐線各駅停車: 重複綾瀬削除 + 北千住を先頭に ──
    line = find_line(lines, "JR::常磐線各駅停車")
    if line:
        # 北千住を取り出す
        kitasenju = None
        rest = []
        for s in line["stations"]:
            if s["name"] == "北千住" and kitasenju is None:
                kitasenju = s
            else:
                rest.append(s)

        # 重複綾瀬を削除
        seen = set()
        unique = []
        for s in rest:
            if s["name"] not in seen:
                seen.add(s["name"])
                unique.append(s)

        # 北千住を先頭に
        if kitasenju:
            line["stations"] = [kitasenju] + unique
            print("常磐線各駅停車: moved 北千住 to front, removed duplicate 綾瀬")

    # ── 保存 ──
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"\nSaved: {path}")

    # 各路線の修正後駅数を表示
    print("\n=== 修正後の駅数 ===")
    check_keys = [
        "JR::宇都宮線",
        "Toei::都営浅草線",
        "Odakyu::小田急小田原線",
        "Odakyu::小田急江ノ島線",
        "JR::相模線",
        "JR::湘南新宿ライン",
        "JR::常磐線各駅停車",
    ]
    for key in check_keys:
        line = find_line(lines, key)
        if line:
            print(f"  {line['name']}: {len(line['stations'])} stations")
            # 最初と最後の3駅を表示
            stations = line["stations"]
            for i in [0, 1, 2]:
                if i < len(stations):
                    print(f"    [{i}] {stations[i]['name']}")
            if len(stations) > 6:
                print(f"    ...")
            for i in range(max(3, len(stations) - 3), len(stations)):
                print(f"    [{i}] {stations[i]['name']}")


if __name__ == "__main__":
    main()
