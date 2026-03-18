#!/usr/bin/env python3
"""
同一路線名の上り/下りGeoJSON featureを1本に統合する。
各路線名につき最も座標数の多いfeatureを残す。
"""

import json
import os
import shutil
from collections import defaultdict

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")


def count_coords(geom: dict) -> int:
    if geom["type"] == "LineString":
        return len(geom["coordinates"])
    elif geom["type"] == "MultiLineString":
        return sum(len(seg) for seg in geom["coordinates"])
    return 0


def main() -> None:
    path = os.path.join(DATA_DIR, "geojson", "rail_lines.geojson")
    with open(path, encoding="utf-8") as f:
        geo = json.load(f)

    # 路線名ごとにfeatureをグループ化
    by_name: dict[str, list[dict]] = defaultdict(list)
    for feat in geo["features"]:
        name = feat["properties"].get("name", "")
        by_name[name].append(feat)

    # 各グループから最大座標数のfeatureのみ残す
    kept = []
    deduped = 0
    for name, feats in by_name.items():
        if len(feats) <= 1:
            kept.extend(feats)
            continue
        best = max(feats, key=lambda f: count_coords(f["geometry"]))
        kept.append(best)
        deduped += len(feats) - 1

    print(f"Original: {len(geo['features'])}, Kept: {len(kept)}, Removed: {deduped}")

    geo["features"] = kept
    with open(path, "w", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Saved: {path}")

    pub = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data", "geojson", "rail_lines.geojson")
    shutil.copy(path, pub)
    print(f"Copied: {pub}")


if __name__ == "__main__":
    main()
