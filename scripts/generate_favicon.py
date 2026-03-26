#!/usr/bin/env python3
"""
ファビコンSVGを生成する。

デザイン:
- 緑背景(#16a34a)に角丸
- 上部に白文字「TM」
- 下部に東京都本土のシルエット（全区を結合し白で塗りつぶし）
- 島しょ部は除外、川による分断は無視

使い方:
  python3 scripts/generate_favicon.py
"""

import json
import os
import subprocess

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public")


def simplify(ring, max_pts=40):
    """ポリゴンの頂点数を削減する。"""
    if len(ring) <= max_pts:
        return ring
    step = max(1, len(ring) // max_pts)
    return ring[::step]


def main():
    with open(os.path.join(DATA_DIR, "geojson", "wards.geojson"), encoding="utf-8") as f:
        geo = json.load(f)

    # 全区のポリゴンを収集（本土のみ）
    ward_polys = []
    for feat in geo["features"]:
        geom = feat["geometry"]

        def get_outer(coords, gtype):
            if gtype == "Polygon":
                return [coords[0]]
            elif gtype == "MultiPolygon":
                return [p[0] for p in coords]
            return []

        for ring in get_outer(geom["coordinates"], geom["type"]):
            mainland = [(c[0], c[1]) for c in ring if c[1] > 35.3 and c[0] > 138.8]
            if len(mainland) > 20:
                ward_polys.append(mainland)

    # 座標範囲を計算
    all_pts = [p for w in ward_polys for p in w]
    min_lng = min(p[0] for p in all_pts)
    max_lng = max(p[0] for p in all_pts)
    min_lat = min(p[1] for p in all_pts)
    max_lat = max(p[1] for p in all_pts)

    # SVG座標マッピング（下部60%に配置）
    sy_top, sy_bot = 180, 490
    sx_left, sx_right = 16, 496
    sw = sx_right - sx_left
    sh = sy_bot - sy_top
    lng_r = max_lng - min_lng
    lat_r = max_lat - min_lat
    scale = min(sw / lng_r, sh / lat_r)
    ox = sx_left + (sw - lng_r * scale) / 2
    oy = sy_top + (sh - lat_r * scale) / 2

    def to_svg(lng, lat):
        x = ox + (lng - min_lng) * scale
        y = oy + (max_lat - lat) * scale
        return (x, y)

    # 全区のパスを結合（境界線なし、白塗りつぶし一体化）
    ward_paths = []
    for ring in ward_polys:
        simplified = simplify(ring, 40)
        pts = [to_svg(p[0], p[1]) for p in simplified]
        d = "M " + " L ".join(f"{x:.0f},{y:.0f}" for x, y in pts) + " Z"
        ward_paths.append(d)

    all_ward_path = " ".join(ward_paths)

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#16a34a"/>
  <text x="256" y="148" text-anchor="middle" font-size="130" font-weight="800"
        fill="white" font-family="system-ui,sans-serif" letter-spacing="6">TM</text>
  <path d="{all_ward_path}" fill="white" fill-opacity="0.9"
        stroke="white" stroke-width="4" stroke-linejoin="round" stroke-opacity="0.9"/>
</svg>'''

    svg_path = os.path.join(PUBLIC_DIR, "favicon.svg")
    with open(svg_path, "w") as f:
        f.write(svg)
    print(f"Saved: {svg_path} ({len(svg)} bytes, {len(ward_polys)} wards)")

    # PNG生成
    for size in [192, 512]:
        png_path = os.path.join(PUBLIC_DIR, "icons", f"icon-{size}.png")
        try:
            subprocess.run(
                ["convert", svg_path, "-resize", f"{size}x{size}", png_path],
                check=True,
                capture_output=True,
            )
            print(f"Saved: {png_path}")
        except Exception as e:
            print(f"PNG generation failed for {size}px: {e}")


if __name__ == "__main__":
    main()
