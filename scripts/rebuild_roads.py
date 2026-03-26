#!/usr/bin/env python3
"""
主要道路GeoJSONをOverpassから再構築する。

highway分類とref(路線番号)を使い、同名の別道路を根本的に除外する。

方針:
1. Overpassから highway タグ・ref タグ付きで全wayを取得
2. 幹線道路(trunk/primary/secondary)でバックボーンを構成
3. バックボーンをクラスタリングし最大クラスタを選定
4. バックボーンに接続する下位道路(tertiary等)のみ拡張採用
5. セグメントを連結・統合して保存
"""

import json
import math
import os
import re
import shutil
import time
import urllib.request
from collections import defaultdict

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data")
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# 東京の主要幹線道路
MAJOR_ROADS = [
    "環七通り",
    "環八通り",
    "甲州街道",
    "青梅街道",
    "明治通り",
    "山手通り",
    "中央通り",
    "外堀通り",
    "靖国通り",
    "目白通り",
    "新青梅街道",
    "新目白通り",
    "春日通り",
    "尾久橋通り",
    "駒沢通り",
    "旧甲州街道",
    "旧青梅街道",
    "井の頭通り",
    "五日市街道",
    "早稲田通り",
    "白山通り",
    "不忍通り",
    "言問通り",
    "清澄通り",
    "昭和通り",
    "日光街道",
    "水戸街道",
    "京葉道路",
    "蔵前橋通り",
    "三ツ目通り",
    "四ツ目通り",
    "永代通り",
    "晴海通り",
    "鎌倉街道",
    "府中街道",
    "小金井街道",
    "所沢街道",
    "志木街道",
    "川越街道",
    "中山道",
]

BACKBONE_TYPES = {
    "motorway",
    "motorway_link",
    "trunk",
    "trunk_link",
    "primary",
    "primary_link",
    "secondary",
    "secondary_link",
}

CONNECT_THRESHOLD_M = 50
CLUSTER_THRESHOLD_M = 300
BATCH_SIZE = 10
REQUEST_DELAY = 5


# ── 距離計算 ─────────────────────────────────────────────


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def coord_dist(c1: list, c2: list) -> float:
    return haversine_m(c1[1], c1[0], c2[1], c2[0])


def seg_length_m(coords: list) -> float:
    return sum(coord_dist(coords[i], coords[i + 1]) for i in range(len(coords) - 1))


# ── Overpass API ─────────────────────────────────────────


def query_overpass(query: str) -> dict:
    data = f"data={query}".encode()
    req = urllib.request.Request(OVERPASS_URL, data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                return json.loads(resp.read())
        except Exception as e:
            if attempt < 2:
                wait = 15 * (attempt + 1)
                print(f"    Retry {attempt + 1} (wait {wait}s): {e}")
                time.sleep(wait)
            else:
                raise


# ── クラスタリング ────────────────────────────────────────


def cluster_segments(
    segments: list[dict], threshold_m: float
) -> dict[int, list[int]]:
    """Union-Findで端点が近いセグメントをクラスタリング。"""
    n = len(segments)
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for i in range(n):
        for j in range(i + 1, n):
            si, sj = segments[i], segments[j]
            for pi in [si["start"], si["end"]]:
                for pj in [sj["start"], sj["end"]]:
                    if coord_dist(pi, pj) < threshold_m:
                        union(i, j)

    clusters: dict[int, list[int]] = defaultdict(list)
    for i in range(n):
        clusters[find(i)].append(i)
    return clusters


# ── セグメント連結 ────────────────────────────────────────


def chain_segments(
    segments: list[list], threshold_m: float = CONNECT_THRESHOLD_M
) -> list[list]:
    """端点が近いセグメントをグリーディに連結。"""
    if not segments:
        return []

    used = [False] * len(segments)
    chains: list[list] = []

    for start_idx in range(len(segments)):
        if used[start_idx]:
            continue
        used[start_idx] = True
        chain = list(segments[start_idx])

        changed = True
        while changed:
            changed = False
            best_idx = -1
            best_dist = threshold_m
            best_end = ""
            best_side = ""

            for i in range(len(segments)):
                if used[i]:
                    continue
                seg = segments[i]
                cases = [
                    (coord_dist(chain[-1], seg[0]), "start", "end"),
                    (coord_dist(chain[-1], seg[-1]), "end", "end"),
                    (coord_dist(seg[-1], chain[0]), "end", "start"),
                    (coord_dist(seg[0], chain[0]), "start", "start"),
                ]
                for d, seg_end, chain_side in cases:
                    if d < best_dist:
                        best_dist = d
                        best_idx = i
                        best_end = seg_end
                        best_side = chain_side

            if best_idx >= 0:
                used[best_idx] = True
                seg = segments[best_idx]
                changed = True

                if best_side == "end":
                    if best_end == "start":
                        chain.extend(seg[1:])
                    else:
                        chain.extend(list(reversed(seg))[1:])
                else:
                    if best_end == "end":
                        chain = list(seg) + chain[1:]
                    else:
                        chain = list(reversed(seg)) + chain[1:]

        chains.append(chain)

    return chains


def remove_isolated_fragments(
    chains: list[list], min_length_m: float = 1000, isolation_m: float = 500
) -> list[list]:
    """短く孤立したチェーンを除去する。

    min_length_m 未満 かつ 最寄りチェーンの端点から isolation_m 超
    離れたチェーンのみ除去。本線に接続する短セグメントは保持する。
    """
    if len(chains) <= 1:
        return chains

    result = []
    for i, chain in enumerate(chains):
        length = seg_length_m(chain)
        if length >= min_length_m:
            result.append(chain)
            continue

        # 他チェーンの端点との最小距離を計算
        connected = False
        for j, other in enumerate(chains):
            if i == j:
                continue
            for p_c in [chain[0], chain[-1]]:
                for p_o in [other[0], other[-1]]:
                    if coord_dist(p_c, p_o) < isolation_m:
                        connected = True
                        break
                if connected:
                    break
            if connected:
                break

        if connected:
            result.append(chain)

    return result


# ── メイン処理 ────────────────────────────────────────────


def fetch_roads_batch(road_names: list[str]) -> dict[str, list[dict]]:
    """道路名のバッチをOverpassから取得。各wayにhighway/ref/座標を付与。"""
    name_filter = "|".join(re.escape(n) for n in road_names)

    query = f"""
    [out:json][timeout:300];
    way["highway"]["name"~"^({name_filter})$"](35.0,138.9,36.0,140.0);
    out geom tags;
    """

    result = query_overpass(query)
    name_set = set(road_names)
    roads: dict[str, list[dict]] = defaultdict(list)

    for elem in result.get("elements", []):
        if elem["type"] != "way":
            continue
        tags = elem.get("tags", {})
        name = tags.get("name", "")
        if name not in name_set:
            continue

        geom = elem.get("geometry", [])
        coords = [
            [round(pt["lon"], 5), round(pt["lat"], 5)]
            for pt in geom
            if "lon" in pt and "lat" in pt
        ]
        if len(coords) < 2:
            continue

        roads[name].append(
            {
                "coords": coords,
                "highway": tags.get("highway", ""),
                "ref": tags.get("ref", ""),
                "length_m": seg_length_m(coords),
            }
        )

    return roads


def filter_road(name: str, ways: list[dict]) -> tuple[list[list], str]:
    """1つの道路名に対し、バックボーン + 接続拡張でフィルタリング。

    Returns: (kept_coord_lists, dominant_ref)
    """
    if not ways:
        return [], ""

    # ── 1. バックボーン (trunk/primary/secondary) 分離 ──
    backbone = [w for w in ways if w["highway"] in BACKBONE_TYPES]
    extension = [w for w in ways if w["highway"] not in BACKBONE_TYPES]

    if not backbone:
        # 幹線分類なし → 全wayをバックボーン扱いにして長さクラスタリングで選定
        backbone = ways
        extension = []

    # ── 2. バックボーンをクラスタリング ──
    seg_infos = []
    for w in backbone:
        seg_infos.append(
            {
                "start": w["coords"][0],
                "end": w["coords"][-1],
                "length_m": w["length_m"],
            }
        )

    clusters = cluster_segments(seg_infos, CLUSTER_THRESHOLD_M)

    # 最大クラスタ（長さベース）を選定
    cluster_lengths: dict[int, float] = {}
    for cid, indices in clusters.items():
        cluster_lengths[cid] = sum(seg_infos[i]["length_m"] for i in indices)

    max_length = max(cluster_lengths.values())
    keep_indices: set[int] = set()
    for cid, indices in clusters.items():
        if cluster_lengths[cid] >= max_length * 0.3:
            keep_indices.update(indices)

    kept_backbone = [backbone[i] for i in sorted(keep_indices)]

    # ── 3. 接続する下位道路を拡張採用 ──
    kept_coords = [w["coords"] for w in kept_backbone]

    # 反復的に接続チェック（拡張がさらに拡張を呼ぶケース対応）
    added = True
    while added:
        added = False
        remaining = []
        for w in extension:
            if _is_connected_to_any(w["coords"], kept_coords, CONNECT_THRESHOLD_M):
                kept_coords.append(w["coords"])
                added = True
            else:
                remaining.append(w)
        extension = remaining

    # ── 4. dominant ref を集計 ──
    ref_lengths: dict[str, float] = defaultdict(float)
    for w in kept_backbone:
        if w["ref"]:
            for r in w["ref"].split(";"):
                r = r.strip()
                if r:
                    ref_lengths[r] += w["length_m"]
    dominant_ref = max(ref_lengths, key=ref_lengths.get) if ref_lengths else ""

    return kept_coords, dominant_ref


def _is_connected_to_any(
    seg: list, targets: list[list], threshold_m: float
) -> bool:
    """segの端点がtargetsのいずれかの端点にthreshold以内で接続しているか。"""
    for t in targets:
        for p_seg in [seg[0], seg[-1]]:
            for p_tgt in [t[0], t[-1]]:
                if coord_dist(p_seg, p_tgt) < threshold_m:
                    return True
    return False


def _road_bbox(chains: list[list], padding_deg: float = 0.01) -> str:
    """チェーンリストからOverpass用bbox文字列を生成。"""
    all_pts = [pt for c in chains for pt in c]
    lats = [p[1] for p in all_pts]
    lngs = [p[0] for p in all_pts]
    return (
        f"{min(lats) - padding_deg},{min(lngs) - padding_deg},"
        f"{max(lats) + padding_deg},{max(lngs) + padding_deg}"
    )


def fill_gaps_with_ref(
    name: str,
    chains: list[list],
    dominant_ref: str,
) -> list[list]:
    """refベースでギャップを補完する（反復接続拡張方式）。

    既存チェーンの端点から出発し、refが一致するwayを50m以内で
    反復的に接続していく。これにより:
    - 並行する別方向の道路を誤って取り込まない
    - 同refの別道路（バイパスなど）を取り込まない
    - 既存チェーン間のギャップのみを埋める
    """
    if not dominant_ref or len(chains) <= 1:
        return chains

    ref_escaped = re.escape(dominant_ref)
    bbox = _road_bbox(chains, padding_deg=0.02)

    print(f"    Fetching ref={dominant_ref} in road bbox...")
    try:
        result = query_overpass(
            f"""
        [out:json][timeout:300];
        way["highway"]["ref"~"(^|;| ){ref_escaped}($|;| )"]({bbox});
        out geom tags;
        """
        )
    except Exception as e:
        print(f"    Error: {e}")
        return chains

    # ref-way を抽出（幹線のみ）
    ref_segs: list[list] = []
    for elem in result.get("elements", []):
        if elem["type"] != "way":
            continue
        tags = elem.get("tags", {})
        if tags.get("highway", "") not in BACKBONE_TYPES:
            continue

        geom = elem.get("geometry", [])
        coords = [
            [round(pt["lon"], 5), round(pt["lat"], 5)]
            for pt in geom
            if "lon" in pt and "lat" in pt
        ]
        if len(coords) >= 2:
            ref_segs.append(coords)

    if not ref_segs:
        return chains

    print(f"    Got {len(ref_segs)} ref-matching backbone ways")

    # 反復接続拡張: 既存チェーン端点から50m以内のref-wayを順次追加
    kept_coords: list[list] = list(chains)
    remaining = list(ref_segs)
    expansion_threshold = CONNECT_THRESHOLD_M  # 50m

    added = True
    while added:
        added = False
        still_remaining = []
        for seg in remaining:
            if _is_connected_to_any(seg, kept_coords, expansion_threshold):
                kept_coords.append(seg)
                added = True
            else:
                still_remaining.append(seg)
        remaining = still_remaining

    added_count = len(kept_coords) - len(chains)
    if added_count == 0:
        print(f"    No connected ref-ways found")
        return chains

    print(f"    Added {added_count} ref-ways by iterative expansion")

    # 再連結（ref-way はギャップが広めなため 100m で接続）+ 孤立除去
    new_chains = chain_segments(kept_coords, threshold_m=100)
    new_chains = remove_isolated_fragments(new_chains)
    return new_chains


def main() -> None:
    print("=== 主要道路GeoJSON再構築 ===\n")

    # ── Pass 1: 名前ベースで取得 ──
    print("── Pass 1: Fetch by name ──")
    all_roads: dict[str, list[dict]] = {}
    for i in range(0, len(MAJOR_ROADS), BATCH_SIZE):
        batch = MAJOR_ROADS[i : i + BATCH_SIZE]
        print(f"Fetching batch {i // BATCH_SIZE + 1}: {', '.join(batch[:3])}...")
        roads = fetch_roads_batch(batch)
        all_roads.update(roads)
        if i + BATCH_SIZE < len(MAJOR_ROADS):
            time.sleep(REQUEST_DELAY)

    print(
        f"\nFetched {sum(len(v) for v in all_roads.values())} ways "
        f"for {len(all_roads)} roads\n"
    )

    # Pass 1 フィルタリング
    road_results: list[dict] = []  # {name, chains, ref, ways_count, ...}
    for name in MAJOR_ROADS:
        ways = all_roads.get(name, [])
        if not ways:
            print(f"  {name}: no data")
            continue

        total_ways = len(ways)
        backbone_count = sum(1 for w in ways if w["highway"] in BACKBONE_TYPES)

        kept_coords, dominant_ref = filter_road(name, ways)

        if not kept_coords:
            print(f"  {name}: {total_ways} ways -> 0 kept")
            continue

        chains = chain_segments(kept_coords)
        chains = remove_isolated_fragments(chains)

        road_results.append(
            {
                "name": name,
                "chains": chains,
                "ref": dominant_ref,
                "total_ways": total_ways,
                "backbone_count": backbone_count,
            }
        )

        total_km = sum(seg_length_m(c) for c in chains) / 1000
        print(
            f"  {name}: {total_ways} ways -> {len(chains)} chains, "
            f"{total_km:.1f}km"
            + (f" [ref={dominant_ref}]" if dominant_ref else "")
        )

    # ── Pass 2: ref ベースでギャップ補完 ──
    print("\n── Pass 2: Fill gaps by ref ──")
    roads_with_gaps = [
        r for r in road_results if len(r["chains"]) >= 3 and r["ref"]
    ]
    print(f"{len(roads_with_gaps)} roads have gaps to fill\n")

    for r in roads_with_gaps:
        name = r["name"]
        old_count = len(r["chains"])
        print(f"  {name} (ref={r['ref']}, {old_count} chains):")

        time.sleep(REQUEST_DELAY)
        new_chains = fill_gaps_with_ref(name, r["chains"], r["ref"])
        r["chains"] = new_chains

        new_km = sum(seg_length_m(c) for c in new_chains) / 1000
        print(f"    -> {len(new_chains)} chains, {new_km:.1f}km")

    # ── feature 構築 ──
    print("\n── Building features ──")
    features = []
    for r in road_results:
        name = r["name"]
        chains = r["chains"]
        dominant_ref = r["ref"]

        props: dict = {"id": f"road-{name}", "name": name}
        if dominant_ref:
            props["ref"] = dominant_ref

        if len(chains) == 1:
            geometry = {"type": "LineString", "coordinates": chains[0]}
        else:
            geometry = {"type": "MultiLineString", "coordinates": chains}

        features.append(
            {"type": "Feature", "properties": props, "geometry": geometry}
        )

        total_km = sum(seg_length_m(c) for c in chains) / 1000
        print(f"  {name}: {len(chains)} chains, {total_km:.1f}km")

    # 保存
    geo = {"type": "FeatureCollection", "features": features}
    out_path = os.path.join(DATA_DIR, "geojson", "roads.geojson")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))
    print(f"\nSaved: {out_path} ({len(features)} roads)")

    pub_path = os.path.join(PUBLIC_DIR, "geojson", "roads.geojson")
    shutil.copy(out_path, pub_path)
    print(f"Copied: {pub_path}")

    # roads.json メタデータ更新
    road_meta = []
    for feat in features:
        name = feat["properties"]["name"]
        geom = feat["geometry"]
        if geom["type"] == "LineString":
            length = seg_length_m(geom["coordinates"]) / 1000
        else:
            length = sum(seg_length_m(s) for s in geom["coordinates"]) / 1000
        road_meta.append(
            {
                "id": f"road-{name}",
                "name": {
                    "kanji": name,
                    "hiragana": "",
                    "katakana": "",
                    "romaji": "",
                },
            }
        )
    road_meta.sort(key=lambda r: 0, reverse=True)  # 維持

    meta_path = os.path.join(DATA_DIR, "roads.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(road_meta, f, ensure_ascii=False, indent=2)
    print(f"Saved: {meta_path} ({len(road_meta)} roads)")


if __name__ == "__main__":
    main()
