#!/usr/bin/env python3
"""GeoJSONファイルの座標精度を削減してファイルサイズを最適化する"""

import json
import os
import glob

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")
PRECISION = 5  # 小数点以下5桁 ≈ 1.1m精度


def round_coords(coords: list, precision: int = PRECISION) -> list:
    """座標を再帰的に丸める"""
    if isinstance(coords[0], (int, float)):
        return [round(c, precision) for c in coords]
    return [round_coords(c, precision) for c in coords]


def optimize_file(filepath: str) -> None:
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    if "features" in data:
        for feature in data["features"]:
            if "geometry" in feature and "coordinates" in feature["geometry"]:
                feature["geometry"]["coordinates"] = round_coords(
                    feature["geometry"]["coordinates"]
                )

    # インデントなしで保存（ファイルサイズ削減）
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = os.path.getsize(filepath) / 1024
    print(f"  {os.path.basename(filepath)}: {size_kb:.1f} KB")


def main() -> None:
    print("GeoJSONファイルを最適化中...")
    for filepath in sorted(glob.glob(os.path.join(DATA_DIR, "geojson", "*.geojson"))):
        optimize_file(filepath)
    print("完了")


if __name__ == "__main__":
    main()
