#!/usr/bin/env python3
"""
路線の上下線を1本に統合する。

地理的に重複するfeature（同じルートの上り/下り）のみ統合し、
異なるルート（分岐・支線）はすべて保持する。

判定方法:
- 2つのfeatureの座標のbounding boxの重複率を計算
- 重複率が高い（80%以上）場合は同一ルート → 座標数が多い方を残す
- 重複率が低い場合は異なるルート（分岐） → 両方残す
"""

import json
import math
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


def get_all_coords(feat: dict) -> list:
    geom = feat["geometry"]
    if geom["type"] == "LineString":
        return geom["coordinates"]
    elif geom["type"] == "MultiLineString":
        return [c for seg in geom["coordinates"] for c in seg]
    return []


def bbox(coords: list) -> tuple:
    """Returns (min_lng, min_lat, max_lng, max_lat)"""
    lngs = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    return (min(lngs), min(lats), max(lngs), max(lats))


def bbox_overlap_ratio(bb1: tuple, bb2: tuple) -> float:
    """2つのbboxの重複率（小さい方のbboxに対する割合）を返す。"""
    overlap_lng = max(0, min(bb1[2], bb2[2]) - max(bb1[0], bb2[0]))
    overlap_lat = max(0, min(bb1[3], bb2[3]) - max(bb1[1], bb2[1]))
    overlap_area = overlap_lng * overlap_lat

    area1 = max(1e-10, (bb1[2] - bb1[0]) * (bb1[3] - bb1[1]))
    area2 = max(1e-10, (bb2[2] - bb2[0]) * (bb2[3] - bb2[1]))
    smaller = min(area1, area2)

    return overlap_area / smaller if smaller > 0 else 0


def sample_proximity(coords1: list, coords2: list, threshold_m: float = 200) -> float:
    """coords1のサンプル点がcoords2に近い割合を返す（0-1）。"""
    if not coords1 or not coords2:
        return 0

    R = 6371000
    step1 = max(1, len(coords1) // 30)
    samples1 = coords1[::step1]

    # coords2を間引き
    step2 = max(1, len(coords2) // 100)
    targets = coords2[::step2]

    near_count = 0
    for s in samples1:
        min_d = float("inf")
        for t in targets:
            dlat = math.radians(t[1] - s[1])
            dlng = math.radians(t[0] - s[0])
            a = (
                math.sin(dlat / 2) ** 2
                + math.cos(math.radians(s[1]))
                * math.cos(math.radians(t[1]))
                * math.sin(dlng / 2) ** 2
            )
            d = R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
            if d < min_d:
                min_d = d
                if d < threshold_m:
                    break
        if min_d < threshold_m:
            near_count += 1

    return near_count / len(samples1)


def are_geographic_duplicates(feat1: dict, feat2: dict) -> bool:
    """2つのfeatureが地理的に同一ルートかどうかを判定。"""
    coords1 = get_all_coords(feat1)
    coords2 = get_all_coords(feat2)

    if not coords1 or not coords2:
        return False

    # Step 1: bbox overlap check
    bb1 = bbox(coords1)
    bb2 = bbox(coords2)
    overlap = bbox_overlap_ratio(bb1, bb2)
    if overlap < 0.5:
        return False  # bboxの重複が少ない → 異なるルート

    # Step 2: サンプル点の近接チェック（200m以内）
    proximity = sample_proximity(coords1, coords2)
    return proximity > 0.6  # 60%以上の点が近ければ重複


def dedup_group(features: list) -> list:
    """feature群から地理的重複を除去し、分岐は保持。"""
    if len(features) <= 1:
        return features

    # 座標数でソート（多い順）
    features.sort(key=lambda f: -count_coords(f))

    kept = [features[0]]  # 最も座標数が多いfeatureは必ず保持

    for feat in features[1:]:
        is_dup = False
        for k in kept:
            if are_geographic_duplicates(feat, k):
                is_dup = True
                break
        if not is_dup:
            kept.append(feat)

    return kept


def main() -> None:
    geojson_path = os.path.join(DATA_DIR, "geojson", "rail_lines.geojson")
    index_path = os.path.join(DATA_DIR, "lines", "line_index.json")

    with open(geojson_path, encoding="utf-8") as f:
        geo = json.load(f)
    with open(index_path, encoding="utf-8") as f:
        idx = json.load(f)

    feat_by_id = {f["properties"]["id"]: f for f in geo["features"]}

    keep_ids = set()
    total_removed = 0

    for line in idx["lines"]:
        line_ids = line.get("lineIds", [])
        if len(line_ids) <= 1:
            for lid in line_ids:
                keep_ids.add(lid)
            continue

        # このline_keyに属するfeatureを収集
        features = []
        for lid in line_ids:
            feat = feat_by_id.get(lid)
            if feat:
                features.append(feat)

        if not features:
            continue

        # 地理的重複チェックで統合
        kept = dedup_group(features)
        kept_ids = {f["properties"]["id"] for f in kept}

        for lid in line_ids:
            if lid in kept_ids:
                keep_ids.add(lid)

        removed = len(features) - len(kept)
        total_removed += removed

        if removed > 0:
            kept_names = [f["properties"]["name"] for f in kept]
            print(
                f"  {line['key']}: {len(features)} -> {len(kept)} "
                f"(kept: {', '.join(kept_names)})"
            )
            # line_indexを更新
            line["lineIds"] = [f["properties"]["id"] for f in kept]

    # unlinked features: 同様に重複除去
    import re

    linked_ids = set()
    for line in idx["lines"]:
        for lid in line.get("lineIds", []):
            linked_ids.add(lid)

    unlinked = [f for f in geo["features"] if f["properties"]["id"] not in linked_ids]

    def normalize_name(name):
        name = re.sub(r"（上り）|（下り）|上り|下り", "", name)
        name = re.sub(r"\(.*?=>.*?\)|\(.*?→.*?\)", "", name)
        name = re.sub(r"=> .*|→ .*|<= .*|← .*", "", name)
        name = re.sub(r"\s+", " ", name).strip()
        return name

    unlinked_groups: dict[str, list] = {}
    for feat in unlinked:
        norm = normalize_name(feat["properties"]["name"])
        unlinked_groups.setdefault(norm, []).append(feat)

    for norm, feats in unlinked_groups.items():
        kept = dedup_group(feats)
        for f in kept:
            keep_ids.add(f["properties"]["id"])
        removed = len(feats) - len(kept)
        total_removed += removed
        if removed > 0:
            print(f"  [unlinked] {norm}: {len(feats)} -> {len(kept)}")

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

    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(idx, f, ensure_ascii=False, indent=2)
    pub_idx = os.path.join(PUBLIC_DIR, "line_index.json")
    shutil.copy(index_path, pub_idx)
    print(f"Saved: {index_path}")


if __name__ == "__main__":
    main()
