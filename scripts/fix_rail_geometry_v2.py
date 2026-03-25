#!/usr/bin/env python3
"""
路線ジオメトリ修正スクリプト v2
Issue #121: 残存する4路線のジオメトリ問題を修正

1. 京成本線 普通 (line-19928461) - 特急featureからジオメトリを流用
2. 宇都宮線 (line-5652901) - 東北本線 relation 9282836 + bbox方式
3. 西武池袋線 (line-seibu-ikebukuro) - bbox + operator方式 + 駅座標ガイド
4. 東急新横浜線 (line-14681765/66) - 不正セグメント除去 + API再取得
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
REQUEST_DELAY = 5


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
            with urllib.request.urlopen(req, timeout=300) as resp:
                return json.loads(resp.read())
        except Exception as e:
            if attempt < 2:
                wait = 10 * (attempt + 1)
                print(f"    Retry {attempt + 1} (wait {wait}s): {e}")
                time.sleep(wait)
            else:
                raise


def chain_segments_tolerant(
    segments: list[list], tolerance_m: float = CHAIN_TOLERANCE_M
) -> list[list]:
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
                chain.extend(
                    seg[1:]
                    if coord_dist(chain[-1], seg[0]) < tolerance_m
                    else seg
                )

        chains.append(chain)

    return chains


def extract_segments_from_result(result: dict) -> list[list]:
    """Overpass API結果からwayジオメトリを抽出。"""
    segments = []
    for elem in result.get("elements", []):
        if elem["type"] == "way":
            geom_data = elem.get("geometry", [])
            if not geom_data:
                continue
            coords = [
                [round(pt["lon"], 5), round(pt["lat"], 5)]
                for pt in geom_data
                if "lon" in pt and "lat" in pt
            ]
            if len(coords) >= 2:
                segments.append(coords)
        elif elem["type"] == "relation":
            for member in elem.get("members", []):
                if member["type"] != "way" or member.get("role", "") == "platform":
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
    return segments


def filter_segments_near_stations(
    segments: list[list], stations: list[list], max_dist_m: float
) -> list[list]:
    """駅座標に近いセグメントのみフィルタリング。"""
    filtered = []
    for seg in segments:
        sample_indices = set([0, len(seg) // 4, len(seg) // 2, 3 * len(seg) // 4, -1])
        for idx in sample_indices:
            pt = seg[idx]
            min_dist = min(coord_dist(pt, s) for s in stations)
            if min_dist < max_dist_m:
                filtered.append(seg)
                break
    return filtered


def clip_chain_to_stations(
    chain: list, start_station: list, end_station: list
) -> list:
    """チェーンを始点駅〜終点駅の区間にクリップ。"""
    si = min(range(len(chain)), key=lambda i: coord_dist(chain[i], start_station))
    ei = min(range(len(chain)), key=lambda i: coord_dist(chain[i], end_station))
    if si > ei:
        si, ei = ei, si
    return chain[si : ei + 1]


def extract_ordered_segments_per_relation(result: dict) -> dict[int, list[list]]:
    """Overpass APIの結果からrelation単位で順序保持しつつセグメントを抽出。"""
    per_rel: dict[int, list[list]] = {}
    for elem in result.get("elements", []):
        if elem["type"] != "relation":
            continue
        rel_id = elem["id"]
        segments = []
        for member in elem.get("members", []):
            if member["type"] != "way" or member.get("role", "") == "platform":
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
            per_rel[rel_id] = segments
    return per_rel


def chain_ordered(segments: list[list], max_gap_m: float = 5000) -> list[list]:
    """セグメントを与えられた順序でチェーン化。大きなギャップでは分割する。"""
    if not segments:
        return []

    chains = []
    chain = list(segments[0])

    for i in range(1, len(segments)):
        seg = segments[i]

        d_fwd = coord_dist(chain[-1], seg[0])
        d_rev = coord_dist(chain[-1], seg[-1])

        if min(d_fwd, d_rev) > max_gap_m:
            chains.append(chain)
            chain = list(seg)
            continue

        if d_fwd <= d_rev:
            if d_fwd < 100:
                chain.extend(seg[1:])
            else:
                chain.extend(seg)
        else:
            rev = list(reversed(seg))
            if d_rev < 100:
                chain.extend(rev[1:])
            else:
                chain.extend(rev)

    chains.append(chain)
    return chains


def find_best_route(
    chains: list[list],
    stations: list[list],
    expected_dist_m: float,
    extra_segs: list[list] | None = None,
) -> list | None:
    """チェーンリストから最適なルートを構築する。

    1. 最長チェーンをクリップして検証
    2. 複数チェーンを駅順に結合して検証
    3. 必要に応じて extra_segs で始点/終点を延長
    """
    if not chains:
        return None

    start_st = stations[0]
    end_st = stations[-1]
    _extra = extra_segs or []

    def _validate(path: list) -> list | None:
        """パスの長さ・始点駅・終点駅の到達を検証。延長も試みる。"""
        if len(path) < 100:
            return None
        path_len = sum(
            coord_dist(path[i], path[i + 1]) for i in range(len(path) - 1)
        )
        if path_len > expected_dist_m * 2.5:
            return None
        # 始点/終点が遠い場合は延長を試みる
        path = extend_to_terminals(path, _extra, stations)
        d_s = min(coord_dist(c, start_st) for c in path[:min(50, len(path))])
        d_e = min(coord_dist(c, end_st) for c in path[-min(50, len(path)):])
        if d_s < 2000 and d_e < 2000:
            return path
        return None

    # 方法1: 最長チェーンをクリップ
    chains_sorted = sorted(chains, key=len, reverse=True)
    for chain in chains_sorted[:5]:
        d_start = min(coord_dist(c, start_st) for c in chain)
        d_end = min(coord_dist(c, end_st) for c in chain)
        if d_start < 5000 and d_end < 5000:
            clipped = clip_chain_to_stations(chain, start_st, end_st)
            result = _validate(clipped)
            if result:
                return result

    # 方法2: 複数チェーンを駅順に結合
    oriented = []
    for chain in chains:
        mid = chain[len(chain) // 2]
        if min(coord_dist(mid, s) for s in stations) > 10000:
            continue
        d_fwd = min(coord_dist(chain[0], s) for s in stations[:3])
        d_rev = min(coord_dist(chain[-1], s) for s in stations[:3])
        if d_rev < d_fwd:
            chain = list(reversed(chain))
        oriented.append(chain)

    if not oriented:
        return None

    def progress_key(chain):
        mid = chain[len(chain) // 2]
        best_si = min(
            range(len(stations)), key=lambda i: coord_dist(mid, stations[i])
        )
        return best_si

    oriented.sort(key=progress_key)

    path = list(oriented[0])
    for chain in oriented[1:]:
        gap = coord_dist(path[-1], chain[0])
        if gap < 5000:
            if gap < 100:
                path.extend(chain[1:])
            else:
                path.extend(chain)

    clipped = clip_chain_to_stations(path, start_st, end_st)
    result = _validate(clipped)
    if result:
        return result

    return None


def extend_to_terminals(
    path: list, extra_segs: list[list], stations: list[list]
) -> list:
    """パスを始点駅・終点駅まで延長する（既存セグメントを利用）。"""
    start_st = stations[0]
    end_st = stations[-1]
    extended = list(path)

    for terminal, is_start in [(start_st, True), (end_st, False)]:
        ref_pt = extended[0] if is_start else extended[-1]
        d_terminal = min(
            coord_dist(c, terminal)
            for c in (extended[:50] if is_start else extended[-50:])
        )
        if d_terminal < 1000:
            continue  # すでに到達している

        # terminal に近く、かつパスの端に近いセグメントを探す
        best_seg = None
        best_score = float("inf")
        for seg in extra_segs:
            seg_to_terminal = min(coord_dist(c, terminal) for c in seg)
            seg_to_path = min(coord_dist(c, ref_pt) for c in seg)
            if seg_to_terminal < 1500 and seg_to_path < 5000:
                score = seg_to_terminal + seg_to_path
                if score < best_score:
                    best_score = score
                    best_seg = seg

        if best_seg is None:
            continue

        # セグメントの向きを terminal → path端 に揃え、パスの端に近い点でカット
        cut_idx = min(
            range(len(best_seg)), key=lambda i: coord_dist(best_seg[i], ref_pt)
        )
        term_idx = min(
            range(len(best_seg)), key=lambda i: coord_dist(best_seg[i], terminal)
        )

        if is_start:
            # terminal → cut_point → (path start)
            if term_idx < cut_idx:
                piece = best_seg[term_idx : cut_idx + 1]
            else:
                piece = list(reversed(best_seg[cut_idx : term_idx + 1]))
            if len(piece) > 2:
                extended = piece + extended
        else:
            # (path end) → cut_point → terminal
            if cut_idx < term_idx:
                piece = best_seg[cut_idx : term_idx + 1]
            else:
                piece = list(reversed(best_seg[term_idx : cut_idx + 1]))
            if len(piece) > 2:
                extended = extended + piece

    return extended


def count_gaps(feat: dict, min_gap_m: float = 1000) -> int:
    """featureのジオメトリにおけるギャップ数をカウント。"""
    geom = feat["geometry"]
    if geom["type"] != "MultiLineString":
        return 0
    segs = geom["coordinates"]
    gaps = 0
    for i in range(len(segs) - 1):
        if coord_dist(segs[i][-1], segs[i + 1][0]) > min_gap_m:
            gaps += 1
    return gaps


def find_feature(geo: dict, feature_id: str):
    for feat in geo["features"]:
        if feat["properties"]["id"] == feature_id:
            return feat
    return None


def get_coord_count(feat: dict) -> int:
    geom = feat["geometry"]
    if geom["type"] == "LineString":
        return len(geom["coordinates"])
    elif geom["type"] == "MultiLineString":
        return sum(len(s) for s in geom["coordinates"])
    return 0


def update_geometry(feat: dict, chains: list[list]) -> None:
    if len(chains) == 1:
        feat["geometry"] = {"type": "LineString", "coordinates": chains[0]}
    else:
        feat["geometry"] = {"type": "MultiLineString", "coordinates": chains}


# ── Fix 1: 京成本線 普通 ──────────────────────────────────────


def fix_keisei_local(geo: dict) -> bool:
    """京成本線 普通 (line-19928461) のジオメトリを特急featureから流用。"""
    print("\n=== Fix 1: 京成本線 普通 (line-19928461) ===")

    local = find_feature(geo, "line-19928461")
    express = find_feature(geo, "line-3336658")  # 成田空港→京成上野 (1541 coords)

    if not local:
        print("  line-19928461 not found, skipping")
        return False
    if not express:
        print("  line-3336658 (express) not found, skipping")
        return False

    local_coords = get_coord_count(local)
    express_geom = express["geometry"]

    if express_geom["type"] == "LineString":
        new_coords = list(express_geom["coordinates"])
    else:
        new_coords = []
        for seg in express_geom["coordinates"]:
            new_coords.extend(seg)

    # 普通は「京成津田沼→京成上野」方向なので express（成田空港→京成上野）をそのまま使用
    # 方向は表示時に問題にならないのでそのまま
    local["geometry"] = {"type": "LineString", "coordinates": new_coords}
    print(f"  Updated: {local_coords} -> {len(new_coords)} coords (from express feature)")
    return True


# ── Fix 2: 宇都宮線 ──────────────────────────────────────────

# 宇都宮線の駅座標（上野→雀宮）
UTSUNOMIYA_STATIONS = [
    [139.7764768, 35.7134394],  # 上野
    [139.7536899, 35.7469489],  # 尾久
    [139.720847, 35.7781576],  # 赤羽
    [139.6571269, 35.8589616],  # 浦和
    [139.6338292, 35.8935861],  # さいたま新都心
    [139.6240606, 35.906316],  # 大宮
    [139.6321346, 35.9317759],  # 土呂
    [139.6403278, 35.9486232],  # 東大宮
    [139.6530635, 35.9813997],  # 蓮田
    [139.6669008, 36.0174085],  # 白岡
    [139.67723, 36.0656306],  # 久喜
    [139.6795953, 36.0895134],  # 東鷲宮
    [139.6940977, 36.136417],  # 栗橋
    [139.7095071, 36.1945874],  # 古河
    [139.7348787, 36.2302],  # 野木
    [139.761192, 36.258002],  # 間々田
    [139.8059151, 36.3122377],  # 小山
    [139.8421678, 36.374634],  # 小金井
    [139.8545254, 36.3953175],  # 自治医大
    [139.8665578, 36.4363396],  # 石橋
    [139.877072, 36.4939206],  # 雀宮
]


def fix_utsunomiya(geo: dict) -> bool:
    """宇都宮線 (line-5652901) のギャップを東北本線relationで補完。"""
    print("\n=== Fix 2: 宇都宮線 (line-5652901) ===")

    feat = find_feature(geo, "line-5652901")
    if not feat:
        print("  line-5652901 not found, skipping")
        return False

    old_coords = get_coord_count(feat)
    old_gaps = count_gaps(feat)
    stations = UTSUNOMIYA_STATIONS
    expected_dist = sum(
        coord_dist(stations[i], stations[i + 1]) for i in range(len(stations) - 1)
    )
    print(f"  Current: {old_coords} coords, {old_gaps} gaps (>1km)")
    print(f"  Expected route distance: {expected_dist/1000:.1f}km")

    # 既存セグメントを保存（terminal extension 用）
    existing_segs: list[list] = []
    geom = feat["geometry"]
    if geom["type"] == "MultiLineString":
        for seg in geom["coordinates"]:
            mid = seg[len(seg) // 2]
            if min(coord_dist(mid, s) for s in stations) < 5000:
                existing_segs.append(seg)
    elif geom["type"] == "LineString":
        existing_segs.append(geom["coordinates"])

    # 方法1: 東北本線 relation 9282836 (順序保持チェーン)
    print("  Fetching 東北本線 relation 9282836...")
    try:
        result = query_overpass(
            """
        [out:json][timeout:300];
        rel(9282836);
        out geom;
        """
        )
        per_rel = extract_ordered_segments_per_relation(result)
        if 9282836 in per_rel:
            segments = per_rel[9282836]
            filtered = filter_segments_near_stations(segments, stations, 3000)
            print(f"  Got {len(segments)} -> filtered {len(filtered)} ordered segments")
            chains = chain_ordered(filtered, max_gap_m=5000)
            total = sum(len(c) for c in chains)
            print(f"  Ordered chains: {len(chains)}, {total} coords")
            path = find_best_route(chains, stations, expected_dist, existing_segs)
            if path:
                update_geometry(feat, [path])
                print(f"  Updated: {old_coords}/{old_gaps}gaps -> {len(path)} coords/0 gaps (rel 9282836)")
                return True
    except Exception as e:
        print(f"  Error: {e}")

    time.sleep(REQUEST_DELAY)

    # 方法2: route relation 5652901 (順序保持チェーン)
    print("  Fetching route relation 5652901...")
    try:
        result = query_overpass(
            """
        [out:json][timeout:300];
        rel(5652901);
        out geom;
        """
        )
        per_rel = extract_ordered_segments_per_relation(result)
        if 5652901 in per_rel:
            segments = per_rel[5652901]
            filtered = filter_segments_near_stations(segments, stations, 3000)
            print(f"  Got {len(segments)} -> filtered {len(filtered)} ordered segments")
            chains = chain_ordered(filtered, max_gap_m=5000)
            total = sum(len(c) for c in chains)
            print(f"  Ordered chains: {len(chains)}, {total} coords")
            path = find_best_route(chains, stations, expected_dist, existing_segs)
            if path:
                update_geometry(feat, [path])
                print(f"  Updated: {old_coords}/{old_gaps}gaps -> {len(path)} coords/0 gaps (rel 5652901)")
                return True
    except Exception as e:
        print(f"  Error: {e}")

    time.sleep(REQUEST_DELAY)

    # 方法3: bbox全セグメント + distance-tolerant chaining
    print("  Trying bbox approach with best-route assembly...")
    try:
        result = query_overpass(
            """
        [out:json][timeout:300];
        way["railway"="rail"]["operator"~"東日本旅客鉄道"]["usage"="main"]
          (35.68,139.58,36.55,139.92);
        out geom;
        """
        )
        segments = extract_segments_from_result(result)
        filtered = filter_segments_near_stations(segments, stations, 2000)
        print(f"  Got {len(segments)} -> filtered {len(filtered)} segments")

        # 既存セグメント（範囲内）も追加
        geom = feat["geometry"]
        if geom["type"] == "MultiLineString":
            for seg in geom["coordinates"]:
                mid = seg[len(seg) // 2]
                if min(coord_dist(mid, s) for s in stations) < 5000:
                    filtered.append(seg)

        chains = chain_segments_tolerant(filtered, tolerance_m=50)
        total = sum(len(c) for c in chains)
        print(f"  Chained to {len(chains)} chains, {total} coords")
        top5 = sorted(chains, key=len, reverse=True)[:5]
        for i, c in enumerate(top5):
            c_len = sum(coord_dist(c[j], c[j + 1]) for j in range(len(c) - 1))
            print(f"    Chain {i}: {len(c)} coords, {c_len/1000:.1f}km")

        path = find_best_route(chains, stations, expected_dist, existing_segs)
        if path:
            update_geometry(feat, [path])
            print(f"  Updated: {old_coords}/{old_gaps}gaps -> {len(path)} coords")
            return True

    except Exception as e:
        print(f"  Error: {e}")

    print("  Could not improve geometry")
    return False


# ── Fix 3: 西武池袋線 ──────────────────────────────────────────

# 西武池袋線の駅座標（池袋→飯能）
SEIBU_STATIONS = [
    [139.7110372, 35.7280917],  # 池袋
    [139.6948922, 35.7264476],  # 椎名町
    [139.6828643, 35.7302608],  # 東長崎
    [139.6727894, 35.7375689],  # 江古田
    [139.6623844, 35.7387537],  # 桜台
    [139.6540818, 35.737877],  # 練馬
    [139.6378105, 35.7368176],  # 中村橋
    [139.6300042, 35.7359523],  # 富士見台
    [139.6163048, 35.7409213],  # 練馬高野台
    [139.6061566, 35.7438271],  # 石神井公園
    [139.5865223, 35.7495045],  # 大泉学園
    [139.5673646, 35.7483016],  # 保谷
    [139.5455333, 35.7515231],  # ひばりヶ丘
    [139.5340853, 35.7602506],  # 東久留米
    [139.5198187, 35.772084],  # 清瀬
    [139.496609, 35.7785324],  # 秋津
    [139.4733096, 35.7867907],  # 所沢
    [139.4560657, 35.7889568],  # 西所沢
    [139.4377917, 35.8006184],  # 小手指
    [139.4167118, 35.8105229],  # 狭山ヶ丘
    [139.4125668, 35.821335],  # 武蔵藤沢
    [139.3985589, 35.8449274],  # 稲荷山公園
    [139.3901317, 35.8426832],  # 入間市
    [139.3599938, 35.8377028],  # 仏子
    [139.345729, 35.8405537],  # 元加治
    [139.3190593, 35.8510047],  # 飯能
]


def fix_seibu_ikebukuro(geo: dict) -> bool:
    """西武池袋線 (line-seibu-ikebukuro) をbbox+operator方式で再構築。"""
    print("\n=== Fix 3: 西武池袋線 (line-seibu-ikebukuro) ===")

    feat = find_feature(geo, "line-seibu-ikebukuro")
    if not feat:
        print("  line-seibu-ikebukuro not found, skipping")
        return False

    old_coords = get_coord_count(feat)
    old_gaps = count_gaps(feat)
    stations = SEIBU_STATIONS
    expected_dist = sum(
        coord_dist(stations[i], stations[i + 1]) for i in range(len(stations) - 1)
    )
    print(f"  Current: {old_coords} coords, {old_gaps} gaps (>1km)")
    print(f"  Expected route distance: {expected_dist/1000:.1f}km")

    # 既存セグメント（範囲内）を収集 — terminal extension にも使用
    existing_segs: list[list] = []
    geom = feat["geometry"]
    if geom["type"] == "MultiLineString":
        for seg in geom["coordinates"]:
            mid = seg[len(seg) // 2]
            if min(coord_dist(mid, s) for s in stations) < 3000:
                existing_segs.append(seg)
    elif geom["type"] == "LineString":
        existing_segs.append(geom["coordinates"])
    print(f"  Existing segments in range: {len(existing_segs)}")

    all_segments: list[list] = list(existing_segs)

    # 方法1: route relation を検索 → 順序保持チェーン
    print("  Searching for 西武池袋線 route relations...")
    try:
        result = query_overpass(
            """
        [out:json][timeout:60];
        rel["type"="route"]["route"="train"]["operator"~"西武鉄道|西武"]["name"~"池袋線"];
        out tags;
        """
        )

        rels = []
        for elem in result.get("elements", []):
            if elem["type"] == "relation":
                tags = elem.get("tags", {})
                print(f"    Found: {elem['id']} - {tags.get('name', '?')}")
                rels.append(elem["id"])

        if rels:
            print(f"  Fetching {len(rels)} relation(s) with ordered chaining...")
            time.sleep(REQUEST_DELAY)
            id_str = ",".join(str(r) for r in rels[:5])
            result = query_overpass(
                f"""
            [out:json][timeout:300];
            rel(id:{id_str});
            out geom;
            """
            )
            per_rel = extract_ordered_segments_per_relation(result)

            for rel_id, segments in per_rel.items():
                filtered = filter_segments_near_stations(segments, stations, 1500)
                print(f"    Rel {rel_id}: {len(segments)} -> {len(filtered)} segments")
                chains = chain_ordered(filtered, max_gap_m=5000)
                total = sum(len(c) for c in chains)
                print(f"    Ordered chains: {len(chains)}, {total} coords")
                path = find_best_route(chains, stations, expected_dist, existing_segs)
                if path:
                    update_geometry(feat, [path])
                    print(f"  Updated: {old_coords}/{old_gaps}gaps -> {len(path)} coords/0 gaps (relation)")
                    return True
                # 順序チェーンが駄目ならセグメントだけ追加
                all_segments.extend(filtered)

    except Exception as e:
        print(f"  Error: {e}")

    time.sleep(REQUEST_DELAY)

    # 方法2: bbox + operator
    print("  Fetching bbox segments...")
    try:
        result = query_overpass(
            """
        [out:json][timeout:300];
        way["railway"="rail"]["operator"~"西武鉄道|西武"]
          (35.70,139.28,35.87,139.72);
        out geom;
        """
        )
        segments = extract_segments_from_result(result)
        filtered = filter_segments_near_stations(segments, stations, 1500)
        print(f"  Got {len(segments)} -> filtered {len(filtered)} from bbox")
        all_segments.extend(filtered)
    except Exception as e:
        print(f"  Error: {e}")

    print(f"  Total segments: {len(all_segments)}")

    # 全セグメントを distance-tolerant chain → best route
    print("  Chaining all segments...")
    chains = chain_segments_tolerant(all_segments, tolerance_m=50)
    total = sum(len(c) for c in chains)
    print(f"  Chained to {len(chains)} chains, {total} coords")
    top5 = sorted(chains, key=len, reverse=True)[:5]
    for i, c in enumerate(top5):
        c_len = sum(coord_dist(c[j], c[j + 1]) for j in range(len(c) - 1))
        print(f"    Chain {i}: {len(c)} coords, {c_len/1000:.1f}km")

    path = find_best_route(chains, stations, expected_dist, existing_segs)
    if path:
        update_geometry(feat, [path])
        print(f"  Updated: {old_coords}/{old_gaps}gaps -> {len(path)} coords")
        return True

    print("  Could not improve geometry")
    return False


# ── Fix 4: 東急新横浜線 ──────────────────────────────────────


def fix_tokyu_shinyokohama(geo: dict) -> bool:
    """東急新横浜線の不正セグメント除去 + API再取得。"""
    print("\n=== Fix 4: 東急新横浜線 ===")

    # 新横浜 (139.617, 35.509), 日吉 (139.647, 35.553)
    shinyokohama = [139.6172658, 35.5088096]
    hiyoshi = [139.646943, 35.5534595]
    updated = False

    # まず不正セグメントを除去
    for fid in ["line-14681765", "line-14681766"]:
        feat = find_feature(geo, fid)
        if not feat:
            print(f"  {fid} not found")
            continue

        geom = feat["geometry"]
        name = feat["properties"]["name"]

        if geom["type"] != "MultiLineString":
            continue

        segs = geom["coordinates"]
        good_segs = []

        for i, seg in enumerate(segs):
            start = seg[0]
            end = seg[-1]
            near_start = min(
                coord_dist(start, shinyokohama), coord_dist(start, hiyoshi)
            )
            near_end = min(
                coord_dist(end, shinyokohama), coord_dist(end, hiyoshi)
            )

            if near_start < 2000 or near_end < 2000:
                good_segs.append(seg)
                print(f"  {fid} seg{i}: kept ({len(seg)} coords)")
            else:
                print(
                    f"  {fid} seg{i}: removed ({len(seg)} coords, endpoints too far)"
                )

        if len(good_segs) < len(segs):
            if len(good_segs) == 0:
                print(f"  {name}: all segments removed, keeping original")
                continue
            elif len(good_segs) == 1:
                feat["geometry"] = {
                    "type": "LineString",
                    "coordinates": good_segs[0],
                }
            else:
                feat["geometry"] = {
                    "type": "MultiLineString",
                    "coordinates": good_segs,
                }
            updated = True
            print(f"  {name}: {len(segs)} -> {len(good_segs)} segments")

    # API再取得
    print("  Fetching fresh geometry from Overpass...")
    time.sleep(REQUEST_DELAY)
    try:
        result = query_overpass(
            """
        [out:json][timeout:180];
        rel(id:14681765,14681766);
        out geom;
        """
        )

        for elem in result.get("elements", []):
            if elem["type"] != "relation":
                continue
            rel_id = elem["id"]
            fid = f"line-{rel_id}"
            feat = find_feature(geo, fid)
            if not feat:
                continue

            segments = []
            for member in elem.get("members", []):
                if member["type"] != "way" or member.get("role", "") == "platform":
                    continue
                geom_data = member.get("geometry", [])
                coords = [
                    [round(pt["lon"], 5), round(pt["lat"], 5)]
                    for pt in geom_data
                    if "lon" in pt and "lat" in pt
                ]
                if len(coords) >= 2:
                    segments.append(coords)

            if segments:
                # 駅近傍フィルタリング
                filtered = filter_segments_near_stations(
                    segments, [shinyokohama, hiyoshi], 3000
                )

                chains = chain_segments_tolerant(filtered, tolerance_m=50)
                new_total = sum(len(c) for c in chains)
                old_total = get_coord_count(feat)

                if new_total > old_total:
                    update_geometry(feat, chains)
                    print(f"  {fid}: {old_total} -> {new_total} coords from API")
                    updated = True
                else:
                    print(
                        f"  {fid}: API ({new_total}) not better than current ({old_total})"
                    )

    except Exception as e:
        print(f"  Error: {e}")

    return updated


# ── メイン ──────────────────────────────────────────────────


def main() -> None:
    geojson_path = os.path.join(DATA_DIR, "geojson", "rail_lines.geojson")

    with open(geojson_path, encoding="utf-8") as f:
        geo = json.load(f)

    results = []

    results.append(("京成本線 普通", fix_keisei_local(geo)))

    results.append(("宇都宮線", fix_utsunomiya(geo)))

    results.append(("西武池袋線", fix_seibu_ikebukuro(geo)))

    results.append(("東急新横浜線", fix_tokyu_shinyokohama(geo)))

    print("\n=== Summary ===")
    for name, success in results:
        status = "OK" if success else "NO CHANGE"
        print(f"  [{status}] {name}")

    if any(r[1] for r in results):
        with open(geojson_path, "w", encoding="utf-8") as f:
            json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))
        print(f"\nSaved: {geojson_path}")

        pub = os.path.join(PUBLIC_DIR, "geojson", "rail_lines.geojson")
        shutil.copy(geojson_path, pub)
        print(f"Copied: {pub}")
    else:
        print("\nNo changes made.")


if __name__ == "__main__":
    main()
