#!/usr/bin/env python3
"""
路線の上下線を1本に統合する。

各路線（line_index.jsonのkey）に紐づく複数featureから
最も座標数が多いものを代表として残し、残りを除去する。
line_indexも更新で使用する1つのlineIdのみに絞る。
"""

import json
import os
import shutil

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data")


def count_coords(feat: dict) -> int:
    geom = feat["geometry"]
    if geom["type"] == "LineString":
        return len(geom["coordinates"])
    elif geom["type"] == "MultiLineString":
        return sum(len(s) for s in geom["coordinates"])
    return 0


def main() -> None:
    geojson_path = os.path.join(DATA_DIR, "geojson", "rail_lines.geojson")
    index_path = os.path.join(DATA_DIR, "lines", "line_index.json")

    with open(geojson_path, encoding="utf-8") as f:
        geo = json.load(f)
    with open(index_path, encoding="utf-8") as f:
        idx = json.load(f)

    feat_by_id = {f["properties"]["id"]: f for f in geo["features"]}

    keep_ids = set()  # feature IDs to keep
    total_removed = 0

    for line in idx["lines"]:
        line_ids = line.get("lineIds", [])
        if len(line_ids) <= 1:
            # 1 feature以下 → そのまま
            for lid in line_ids:
                keep_ids.add(lid)
            continue

        # 各featureの座標数を計算
        candidates = []
        for lid in line_ids:
            feat = feat_by_id.get(lid)
            if feat:
                candidates.append((lid, count_coords(feat), feat["properties"]["name"]))

        if not candidates:
            continue

        # 最も座標数が多いfeatureを選択
        candidates.sort(key=lambda x: -x[1])
        best_id, best_coords, best_name = candidates[0]

        keep_ids.add(best_id)
        removed = len(candidates) - 1
        total_removed += removed

        if removed > 0:
            print(f"  {line['key']}: keep {best_name} ({best_coords} coords), remove {removed} others")
            # line_indexを更新
            line["lineIds"] = [best_id]

    # line_indexに紐づかないfeature（unknown）も上下線の重複を統合
    linked_ids = set()
    for line in idx["lines"]:
        for lid in line.get("lineIds", []):
            linked_ids.add(lid)

    unlinked = []
    for feat in geo["features"]:
        fid = feat["properties"]["id"]
        if fid not in linked_ids:
            unlinked.append(feat)

    # unlinkedの中で名前が似ているペアを検出して片方だけ残す
    # 上り/下り, →/←, inbound/outbound 等のパターンで判定
    import re
    def normalize_name(name):
        # 方向を示す部分を除去して正規化
        name = re.sub(r'（上り）|（下り）|上り|下り', '', name)
        name = re.sub(r'\(.*?=>.*?\)|\(.*?→.*?\)', '', name)
        name = re.sub(r'=> .*|→ .*|<= .*|← .*', '', name)
        name = re.sub(r'\s+', ' ', name).strip()
        return name

    unlinked_groups = {}
    for feat in unlinked:
        norm = normalize_name(feat["properties"]["name"])
        if norm not in unlinked_groups:
            unlinked_groups[norm] = []
        unlinked_groups[norm].append(feat)

    for norm, feats in unlinked_groups.items():
        if len(feats) == 1:
            keep_ids.add(feats[0]["properties"]["id"])
        else:
            # 最も座標数が多いものを残す
            feats.sort(key=lambda f: -count_coords(f))
            keep_ids.add(feats[0]["properties"]["id"])
            removed = len(feats) - 1
            total_removed += removed
            if removed > 0:
                print(f"  [unlinked] keep {feats[0]['properties']['name']} ({count_coords(feats[0])} coords), remove {removed}")

    # GeoJSONをフィルタ
    original_count = len(geo["features"])
    geo["features"] = [f for f in geo["features"] if f["properties"]["id"] in keep_ids]
    new_count = len(geo["features"])

    print(f"\nFeatures: {original_count} -> {new_count} (removed {total_removed})")

    # 保存
    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Saved: {geojson_path}")

    pub = os.path.join(PUBLIC_DIR, "geojson", "rail_lines.geojson")
    shutil.copy(geojson_path, pub)
    print(f"Copied: {pub}")

    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(idx, f, ensure_ascii=False, indent=2)
    pub_idx = os.path.join(PUBLIC_DIR, "line_index.json")
    shutil.copy(index_path, pub_idx)
    print(f"Saved: {index_path}")


if __name__ == "__main__":
    main()
