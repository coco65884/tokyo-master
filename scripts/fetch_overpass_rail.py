#!/usr/bin/env python3
"""
Overpass APIから路線のジオメトリを取得し、rail_lines.geojsonを更新する。

1. line_index.jsonの各路線のlineIdからOSM relation IDを取得
2. Overpass APIで各relationのフルジオメトリを取得
3. way memberをチェーンしてLineString/MultiLineStringに変換
4. rail_lines.geojsonのfeatureを更新

また、relationのstop memberから正しい駅順序を取得し、
line_index.jsonの駅順を検証・修正する。
"""

import json
import math
import os
import shutil
import sys
import time
import urllib.request
import urllib.parse

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data")
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Overpass APIリクエスト間のウェイト(秒)
REQUEST_DELAY = 2


def query_overpass(query: str) -> dict:
    """Overpass APIにクエリを送信"""
    data = f"data={query}".encode()
    req = urllib.request.Request(OVERPASS_URL, data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read())
        except Exception as e:
            if attempt < 2:
                print(f"    Retry {attempt + 1}: {e}")
                time.sleep(5 * (attempt + 1))
            else:
                raise


def chain_segments(segments: list[list]) -> list[list]:
    """端点が一致するセグメントを連結してチェーンにする"""
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
            for i in range(len(segments)):
                if used[i]:
                    continue
                seg = segments[i]
                if chain[-1] == seg[0]:
                    chain.extend(seg[1:])
                    used[i] = True
                    changed = True
                elif chain[-1] == seg[-1]:
                    chain.extend(list(reversed(seg))[1:])
                    used[i] = True
                    changed = True
                elif chain[0] == seg[-1]:
                    chain = list(seg) + chain[1:]
                    used[i] = True
                    changed = True
                elif chain[0] == seg[0]:
                    chain = list(reversed(seg)) + chain[1:]
                    used[i] = True
                    changed = True

        chains.append(chain)

    return chains


def fetch_relation_geometry(rel_id: int) -> tuple[list[list], list[dict]]:
    """
    Overpass APIからrelationのジオメトリと駅情報を取得。
    Returns: (chains: list of coordinate chains, stations: list of station dicts)
    """
    query = f"""
    [out:json][timeout:60];
    rel({rel_id});
    out body;
    >;
    out skel qt;
    """
    result = query_overpass(query)

    nodes = {e["id"]: e for e in result["elements"] if e["type"] == "node"}
    ways = {e["id"]: e for e in result["elements"] if e["type"] == "way"}
    rels = [e for e in result["elements"] if e["type"] == "relation"]

    if not rels:
        return [], []

    rel = rels[0]

    # Track way membersからジオメトリを構築
    segments = []
    for m in rel.get("members", []):
        if m["type"] == "way" and m.get("role", "") not in ("platform",):
            way = ways.get(m["ref"])
            if not way:
                continue
            coords = []
            for nid in way.get("nodes", []):
                node = nodes.get(nid)
                if node:
                    coords.append([round(node["lon"], 5), round(node["lat"], 5)])
            if len(coords) >= 2:
                segments.append(coords)

    chains = chain_segments(segments)

    # Stop membersから駅順序を取得
    stations = []
    for m in rel.get("members", []):
        if m["type"] == "node" and m.get("role", "") == "stop":
            node = nodes.get(m["ref"])
            if node:
                name = node.get("tags", {}).get("name", "")
                if name:
                    stations.append(
                        {
                            "id": f"station-{node['id']}",
                            "name": name,
                            "lat": round(node["lat"], 7),
                            "lng": round(node["lon"], 7),
                        }
                    )

    return chains, stations


def main() -> None:
    geojson_path = os.path.join(DATA_DIR, "geojson", "rail_lines.geojson")
    index_path = os.path.join(DATA_DIR, "lines", "line_index.json")

    with open(geojson_path, encoding="utf-8") as f:
        geo = json.load(f)
    with open(index_path, encoding="utf-8") as f:
        index = json.load(f)

    feat_by_id = {f["properties"]["id"]: f for f in geo["features"]}

    # 処理対象のrelation IDを収集（featureのidからOSM relation IDを抽出）
    rel_ids_to_process = set()
    feat_id_to_rel_id = {}
    for feat in geo["features"]:
        fid = feat["properties"]["id"]
        # "line-443282" → 443282
        try:
            rel_id = int(fid.replace("line-", ""))
            feat_id_to_rel_id[fid] = rel_id
            rel_ids_to_process.add(rel_id)
        except ValueError:
            continue

    print(f"Total relations to fetch: {len(rel_ids_to_process)}")

    # バッチでOverpass APIからデータ取得
    # 一度に複数のrelationを取得（rate limit対策）
    rel_ids_list = sorted(rel_ids_to_process)
    BATCH_SIZE = 20
    all_results = {}

    for batch_start in range(0, len(rel_ids_list), BATCH_SIZE):
        batch = rel_ids_list[batch_start : batch_start + BATCH_SIZE]
        id_filter = ",".join(str(r) for r in batch)
        print(f"\nFetching batch {batch_start // BATCH_SIZE + 1}: {len(batch)} relations...")

        query = f"""
        [out:json][timeout:120];
        rel(id:{id_filter});
        out body;
        >;
        out skel qt;
        """
        try:
            result = query_overpass(query)
        except Exception as e:
            print(f"  Error fetching batch: {e}")
            continue

        nodes = {e["id"]: e for e in result["elements"] if e["type"] == "node"}
        ways = {e["id"]: e for e in result["elements"] if e["type"] == "way"}
        rels = {e["id"]: e for e in result["elements"] if e["type"] == "relation"}

        for rel_id in batch:
            rel = rels.get(rel_id)
            if not rel:
                continue

            # Track way membersからセグメント構築
            segments = []
            for m in rel.get("members", []):
                if m["type"] == "way" and m.get("role", "") not in ("platform",):
                    way = ways.get(m["ref"])
                    if not way:
                        continue
                    coords = []
                    for nid in way.get("nodes", []):
                        node = nodes.get(nid)
                        if node:
                            coords.append(
                                [round(node["lon"], 5), round(node["lat"], 5)]
                            )
                    if len(coords) >= 2:
                        segments.append(coords)

            chains = chain_segments(segments)

            # 駅情報
            stations = []
            for m in rel.get("members", []):
                if m["type"] == "node" and m.get("role", "") == "stop":
                    node = nodes.get(m["ref"])
                    if node:
                        name = node.get("tags", {}).get("name", "")
                        if name:
                            stations.append(
                                {
                                    "id": f"station-{node['id']}",
                                    "name": name,
                                    "lat": round(node["lat"], 7),
                                    "lng": round(node["lon"], 7),
                                }
                            )

            if chains:
                total_coords = sum(len(c) for c in chains)
                all_results[rel_id] = {
                    "chains": chains,
                    "stations": stations,
                    "total_coords": total_coords,
                }

        time.sleep(REQUEST_DELAY)

    print(f"\nSuccessfully fetched: {len(all_results)} relations")

    # GeoJSONを更新
    updated = 0
    for feat in geo["features"]:
        fid = feat["properties"]["id"]
        rel_id = feat_id_to_rel_id.get(fid)
        if rel_id is None or rel_id not in all_results:
            continue

        data = all_results[rel_id]
        chains = data["chains"]

        # 既存データより座標数が多い場合のみ更新
        geom = feat["geometry"]
        existing_coords = 0
        if geom["type"] == "LineString":
            existing_coords = len(geom["coordinates"])
        elif geom["type"] == "MultiLineString":
            existing_coords = sum(len(s) for s in geom["coordinates"])

        new_coords = data["total_coords"]
        if new_coords > existing_coords:
            name = feat["properties"]["name"]
            print(f"  Updated: {name} ({existing_coords} -> {new_coords} coords, {len(chains)} chains)")

            if len(chains) == 1:
                feat["geometry"] = {
                    "type": "LineString",
                    "coordinates": chains[0],
                }
            else:
                feat["geometry"] = {
                    "type": "MultiLineString",
                    "coordinates": chains,
                }
            updated += 1

    print(f"\nUpdated {updated} features")

    # 保存
    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Saved: {geojson_path}")

    pub = os.path.join(PUBLIC_DIR, "geojson", "rail_lines.geojson")
    shutil.copy(geojson_path, pub)
    print(f"Copied: {pub}")

    # line_index.jsonの駅順序を更新（Overpassから取得した駅順序で）
    lid_to_line = {}
    for line in index["lines"]:
        for lid in line.get("lineIds", []):
            lid_to_line[lid] = line

    station_updates = 0
    for feat in geo["features"]:
        fid = feat["properties"]["id"]
        rel_id = feat_id_to_rel_id.get(fid)
        if rel_id is None or rel_id not in all_results:
            continue

        data = all_results[rel_id]
        osm_stations = data["stations"]

        if not osm_stations:
            continue

        line = lid_to_line.get(fid)
        if not line:
            continue

        # このlineIdが路線の最初のlineIdの場合のみ駅順を更新
        if line["lineIds"][0] != fid:
            continue

        existing_stations = line.get("stations", [])
        if len(osm_stations) >= len(existing_stations) * 0.8:
            # OSMの駅数が既存の80%以上あれば更新
            line["stations"] = osm_stations
            station_updates += 1
            print(f"  Station order updated: {line['key']} ({len(existing_stations)} -> {len(osm_stations)} stations)")

    if station_updates > 0:
        with open(index_path, "w", encoding="utf-8") as f:
            json.dump(index, f, ensure_ascii=False, indent=2)
        # publicにもコピー
        pub_index = os.path.join(PUBLIC_DIR, "line_index.json")
        shutil.copy(index_path, pub_index)
        print(f"Saved: {index_path} ({station_updates} station orders updated)")


if __name__ == "__main__":
    main()
