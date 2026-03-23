#!/usr/bin/env python3
"""
路線ジオメトリの修正スクリプト。

Phase 1: 2座標セグメント（直線アーティファクト）を無条件で全除去
Phase 2: Overpass API (out geom) から全路線のジオメトリを再取得
         distance-tolerant chaining（50m許容）で接続率を改善
Phase 3: 100m以下のギャップのみ直線で補完（それ以上は補間しない）
"""

import json
import math
import os
import shutil
import time
import urllib.request

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data")
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

CHAIN_TOLERANCE_M = 50
GAP_FILL_MAX_M = 100
REQUEST_DELAY = 2
BATCH_SIZE = 20


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


def query_overpass(query: str) -> dict:
    data = f"data={query}".encode()
    req = urllib.request.Request(OVERPASS_URL, data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                return json.loads(resp.read())
        except Exception as e:
            if attempt < 2:
                wait = 5 * (attempt + 1)
                print(f"    Retry {attempt + 1} (wait {wait}s): {e}")
                time.sleep(wait)
            else:
                raise


def chain_segments_tolerant(
    segments: list[list], tolerance_m: float = CHAIN_TOLERANCE_M
) -> list[list]:
    """距離許容方式でセグメントをチェーンに連結する。"""
    if not segments:
        return []

    used = [False] * len(segments)
    chains = []

    for start in range(len(segments)):
        if used[start]:
            continue
        used[start] = True
        chain = list(segments[start])

        changed = True
        while changed:
            changed = False
            best_i = -1
            best_dist = tolerance_m
            best_reverse_chain = False
            best_reverse_seg = False

            for i in range(len(segments)):
                if used[i]:
                    continue
                seg = segments[i]

                cases = [
                    (coord_dist(chain[-1], seg[0]), False, False),
                    (coord_dist(chain[-1], seg[-1]), False, True),
                    (coord_dist(chain[0], seg[-1]), True, False),
                    (coord_dist(chain[0], seg[0]), True, True),
                ]
                for d, rc, rs in cases:
                    if d < best_dist:
                        best_dist = d
                        best_i = i
                        best_reverse_chain = rc
                        best_reverse_seg = rs

            if best_i >= 0:
                used[best_i] = True
                seg = list(segments[best_i])
                changed = True

                if best_reverse_chain:
                    chain = list(reversed(chain))
                if best_reverse_seg:
                    seg = list(reversed(seg))

                chain.extend(seg[1:] if coord_dist(chain[-1], seg[0]) < tolerance_m else seg)

        chains.append(chain)

    return chains


# ── Phase 1: 2座標セグメント全除去 ──────────────────────────

def phase1_remove_stubs(geo: dict) -> int:
    """全MultiLineStringから2座標セグメントを無条件除去。"""
    total_removed = 0

    for feat in geo["features"]:
        geom = feat["geometry"]
        if geom["type"] != "MultiLineString":
            continue

        original = geom["coordinates"]
        kept = [s for s in original if len(s) >= 3]
        removed = len(original) - len(kept)

        if removed == 0:
            continue

        total_removed += removed
        name = feat["properties"]["name"]
        print(f"  {name}: {removed} stubs removed ({len(kept)} segs remaining)")

        if len(kept) == 0:
            # 全除去 → Phase 2で再取得されるまで空にはできないのでスキップ
            # 最長セグメントを保持
            longest = max(original, key=lambda s: len(s))
            kept = [longest]
            total_removed -= 1
        if len(kept) == 1:
            geom["type"] = "LineString"
            geom["coordinates"] = kept[0]
        else:
            geom["coordinates"] = kept

    return total_removed


# ── Phase 2: Overpass APIからジオメトリ再取得 ─────────────────

def phase2_fetch_overpass(geo: dict) -> int:
    """out geom + distance-tolerant chainingで全路線のジオメトリを更新。"""
    # relation IDの収集
    rel_ids = {}
    for feat in geo["features"]:
        fid = feat["properties"]["id"]
        try:
            rel_id = int(fid.replace("line-", ""))
            rel_ids[fid] = rel_id
        except ValueError:
            continue

    rel_id_list = sorted(set(rel_ids.values()))
    print(f"\nPhase 2: Fetching {len(rel_id_list)} relations from Overpass API...")

    # バッチクエリ
    all_chains: dict[int, list[list]] = {}

    for batch_start in range(0, len(rel_id_list), BATCH_SIZE):
        batch = rel_id_list[batch_start : batch_start + BATCH_SIZE]
        id_filter = ",".join(str(r) for r in batch)
        batch_num = batch_start // BATCH_SIZE + 1
        print(f"  Batch {batch_num}: {len(batch)} relations...")

        query = f"""
        [out:json][timeout:180];
        rel(id:{id_filter});
        out geom;
        """
        try:
            result = query_overpass(query)
        except Exception as e:
            print(f"    Error: {e}")
            continue

        for elem in result.get("elements", []):
            if elem["type"] != "relation":
                continue

            rel_id = elem["id"]
            segments = []

            for member in elem.get("members", []):
                if member["type"] != "way":
                    continue
                if member.get("role", "") == "platform":
                    continue
                geom_data = member.get("geometry", [])
                if not geom_data:
                    continue
                coords = [
                    [round(pt["lon"], 5), round(pt["lat"], 5)]
                    for pt in geom_data
                    if "lon" in pt and "lat" in pt
                ]
                if len(coords) >= 2:
                    segments.append(coords)

            if segments:
                chains = chain_segments_tolerant(segments)
                all_chains[rel_id] = chains

        time.sleep(REQUEST_DELAY)

    print(f"  Fetched geometry for {len(all_chains)} relations")

    # GeoJSON更新
    updated = 0
    for feat in geo["features"]:
        fid = feat["properties"]["id"]
        rel_id = rel_ids.get(fid)
        if rel_id is None or rel_id not in all_chains:
            continue

        chains = all_chains[rel_id]
        new_coords = sum(len(c) for c in chains)

        geom = feat["geometry"]
        existing_coords = 0
        if geom["type"] == "LineString":
            existing_coords = len(geom["coordinates"])
        elif geom["type"] == "MultiLineString":
            existing_coords = sum(len(s) for s in geom["coordinates"])

        if new_coords > existing_coords:
            name = feat["properties"]["name"]
            print(f"  Updated: {name} ({existing_coords} -> {new_coords} coords, {len(chains)} chains)")

            if len(chains) == 1:
                feat["geometry"] = {"type": "LineString", "coordinates": chains[0]}
            else:
                feat["geometry"] = {"type": "MultiLineString", "coordinates": chains}
            updated += 1

    return updated


# ── Phase 2.5: route=railway インフラrelationからギャップ補完 ──

# 路線名 → route=railway relation のマッピング
RAILWAY_INFRA_MAP = {
    "中央": [8836495, 8836496],  # 中央本線（下り/上り）JR東日本
    "東北本線": [1872548],  # ※既存relation
    "常磐": [8506268],
    "東海道": [8519859, 8519860],
    "高崎": [5430809],
    "総武": [10312042],
}


def phase2_5_fill_gaps_from_infra(geo: dict) -> int:
    """
    Phase 2で取得できなかったギャップに対して、
    route=railway のインフラrelationからジオメトリを取得して補完。
    """
    # ギャップがあるfeatureを特定
    gap_features = []
    for feat in geo["features"]:
        geom = feat["geometry"]
        if geom["type"] != "MultiLineString":
            continue
        segs = geom["coordinates"]
        has_gap = False
        for i in range(len(segs) - 1):
            gap = coord_dist(segs[i][-1], segs[i + 1][0])
            if gap > 5000:  # 5km以上のギャップ
                has_gap = True
                break
        if has_gap:
            gap_features.append(feat)

    if not gap_features:
        print("  No features with large gaps")
        return 0

    print(f"\nPhase 2.5: {len(gap_features)} features have gaps > 5km")

    # 路線名からインフラrelation IDを検索
    # まずOverpass APIで route=railway のrelationを検索
    print("  Searching for route=railway relations...")
    try:
        result = query_overpass("""
        [out:json][timeout:30];
        rel["type"="route"]["route"="railway"]["operator"~"東日本旅客鉄道|東海旅客鉄道|東京地下鉄|東京都交通局|東急電鉄|小田急電鉄|京王電鉄|西武鉄道|東武鉄道|京成電鉄|京浜急行電鉄"];
        out tags;
        """)
    except Exception as e:
        print(f"  Error searching: {e}")
        return 0

    infra_rels = {}
    for elem in result.get("elements", []):
        if elem["type"] == "relation":
            name = elem.get("tags", {}).get("name", "")
            infra_rels[elem["id"]] = name

    print(f"  Found {len(infra_rels)} infrastructure relations")

    # ギャップがあるfeatureごとに、最適なインフラrelationを見つけて取得
    updated = 0
    fetched_rels: dict[int, list[list]] = {}

    for feat in gap_features:
        name = feat["properties"]["name"]
        geom = feat["geometry"]
        segs = geom["coordinates"]

        # ギャップの位置を特定
        gaps = []
        for i in range(len(segs) - 1):
            gap_dist = coord_dist(segs[i][-1], segs[i + 1][0])
            if gap_dist > 5000:
                gaps.append({
                    "idx": i,
                    "start": segs[i][-1],
                    "end": segs[i + 1][0],
                    "dist": gap_dist,
                })

        if not gaps:
            continue

        # 該当するインフラrelationを検索
        # 路線名を正規化してマッチング
        def normalize(s):
            for rm in ["JR", "（上り）", "（下り）", "東京メトロ", "都営", "線", "（", "）"]:
                s = s.replace(rm, "")
            return s.strip()

        feat_norm = normalize(name)
        best_rel_id = None
        best_score = 0
        for rel_id, rel_name in infra_rels.items():
            rel_norm = normalize(rel_name)
            # 共通文字列の長さでスコアリング
            score = 0
            for i in range(len(feat_norm)):
                for j in range(i + 2, len(feat_norm) + 1):
                    substr = feat_norm[i:j]
                    if substr in rel_norm and len(substr) > score:
                        score = len(substr)
            if score > best_score and score >= 2:
                best_score = score
                best_rel_id = rel_id

        if not best_rel_id:
            continue

        # インフラrelationからジオメトリ取得（キャッシュ）
        if best_rel_id not in fetched_rels:
            print(f"  Fetching infra relation {best_rel_id} ({infra_rels[best_rel_id]})...")
            try:
                time.sleep(REQUEST_DELAY)
                infra_result = query_overpass(f"""
                [out:json][timeout:180];
                rel({best_rel_id});
                out geom;
                """)
                infra_segments = []
                for elem in infra_result.get("elements", []):
                    if elem["type"] != "relation":
                        continue
                    for member in elem.get("members", []):
                        if member["type"] != "way" or member.get("role", "") == "platform":
                            continue
                        geom_data = member.get("geometry", [])
                        coords = [
                            [round(pt["lon"], 5), round(pt["lat"], 5)]
                            for pt in geom_data
                            if "lon" in pt
                        ]
                        if len(coords) >= 2:
                            infra_segments.append(coords)
                chains = chain_segments_tolerant(infra_segments)
                fetched_rels[best_rel_id] = chains
                total = sum(len(c) for c in chains)
                print(f"    Got {len(chains)} chains, {total} coords")
            except Exception as e:
                print(f"    Error: {e}")
                fetched_rels[best_rel_id] = []
                continue

        infra_chains = fetched_rels[best_rel_id]
        if not infra_chains:
            continue

        # ギャップごとに、インフラチェーンから該当部分を抽出して挿入
        new_segs = list(segs)
        inserted = 0
        offset = 0

        for gap in gaps:
            gap_start = gap["start"]
            gap_end = gap["end"]

            # インフラチェーンから、ギャップを埋める部分を抽出
            for chain in infra_chains:
                # ギャップ始点・終点に最も近いチェーン上の座標を見つける
                best_start_idx = -1
                best_start_dist = 3000  # 3km以内
                best_end_idx = -1
                best_end_dist = 3000

                for ci, c in enumerate(chain):
                    d_start = coord_dist(c, gap_start)
                    d_end = coord_dist(c, gap_end)
                    if d_start < best_start_dist:
                        best_start_dist = d_start
                        best_start_idx = ci
                    if d_end < best_end_dist:
                        best_end_dist = d_end
                        best_end_idx = ci

                if best_start_idx >= 0 and best_end_idx >= 0 and best_start_idx != best_end_idx:
                    # 抽出
                    lo = min(best_start_idx, best_end_idx)
                    hi = max(best_start_idx, best_end_idx)
                    fill_segment = chain[lo : hi + 1]

                    if len(fill_segment) >= 3:
                        # 方向を合わせる
                        if coord_dist(fill_segment[0], gap_start) > coord_dist(fill_segment[-1], gap_start):
                            fill_segment = list(reversed(fill_segment))

                        insert_pos = gap["idx"] + 1 + offset
                        new_segs.insert(insert_pos, fill_segment)
                        inserted += 1
                        offset += 1
                        print(f"  {name}: filled {gap['dist']/1000:.1f}km gap with {len(fill_segment)} coords from {infra_rels[best_rel_id]}")
                        break

        if inserted > 0:
            geom["type"] = "MultiLineString"
            geom["coordinates"] = new_segs
            updated += 1

    return updated


# ── Phase 3: 小ギャップ補完 (100m以下のみ) ───────────────────

def phase3_fill_small_gaps(geo: dict) -> int:
    """100m以下のギャップのみ直線で接続。"""
    total_fills = 0

    for feat in geo["features"]:
        geom = feat["geometry"]
        if geom["type"] != "MultiLineString":
            continue

        segments = geom["coordinates"]
        if len(segments) < 2:
            continue

        result = [segments[0]]
        fills = 0

        for i in range(1, len(segments)):
            prev_end = result[-1][-1]
            curr_start = segments[i][0]
            gap = coord_dist(prev_end, curr_start)

            if 1 < gap <= GAP_FILL_MAX_M:
                result.append([prev_end, curr_start])
                fills += 1

            result.append(segments[i])

        if fills > 0:
            total_fills += fills
            geom["coordinates"] = result

    return total_fills


# ── メイン ──────────────────────────────────────────────────

def main() -> None:
    geojson_path = os.path.join(DATA_DIR, "geojson", "rail_lines.geojson")

    with open(geojson_path, encoding="utf-8") as f:
        geo = json.load(f)

    # Phase 1
    print("Phase 1: Removing all 2-coord stubs...")
    removed = phase1_remove_stubs(geo)
    print(f"  Total removed: {removed}\n")

    # Phase 2
    updated = phase2_fetch_overpass(geo)
    print(f"  Total updated: {updated}\n")

    # Phase 2.5
    print("Phase 2.5: Filling gaps from route=railway infra relations...")
    infra_updated = phase2_5_fill_gaps_from_infra(geo)
    print(f"  Total filled from infra: {infra_updated}\n")

    # Phase 3
    print("Phase 3: Filling small gaps (≤100m)...")
    fills = phase3_fill_small_gaps(geo)
    print(f"  Total gaps filled: {fills}\n")

    # 保存
    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Saved: {geojson_path}")

    pub = os.path.join(PUBLIC_DIR, "geojson", "rail_lines.geojson")
    shutil.copy(geojson_path, pub)
    print(f"Copied: {pub}")


if __name__ == "__main__":
    main()
