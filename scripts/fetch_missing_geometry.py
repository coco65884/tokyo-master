#!/usr/bin/env python3
"""
Issue #128: 欠落しているジオメトリを Overpass API から取得し rail_lines.geojson に追加する。

対象:
1. 湘南新宿ライン (line-4673470, line-5419188) - 再取得
2. 常磐線快速 (line-1872548) - 常磐線 relation から再取得
3. 宇都宮線 (line-12213561, line-12210362) - 新規取得
4. 中央・総武線各駅停車 (line-3351488, line-10312043) - 新規取得
5. 常磐線各駅停車 (line-10025277) - 再取得
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
REQUEST_DELAY = 5


def haversine_m(lat1, lng1, lat2, lng2):
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


def coord_dist(c1, c2):
    return haversine_m(c1[1], c1[0], c2[1], c2[0])


def seg_length(coords):
    return sum(coord_dist(coords[i], coords[i + 1]) for i in range(len(coords) - 1))


def query_overpass(query):
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


def fetch_relation_geometry(rel_id):
    """relation ID からジオメトリを取得し、ordered chain + split at gaps で返す。"""
    result = query_overpass(
        f"""
    [out:json][timeout:300];
    rel({rel_id});
    out geom;
    """
    )

    segments = []
    name = ""
    for elem in result.get("elements", []):
        if elem["type"] != "relation":
            continue
        name = elem.get("tags", {}).get("name", "")
        for member in elem.get("members", []):
            if member["type"] != "way" or member.get("role", "") == "platform":
                continue
            geom = member.get("geometry", [])
            coords = [
                [round(pt["lon"], 5), round(pt["lat"], 5)]
                for pt in geom
                if "lon" in pt and "lat" in pt
            ]
            if len(coords) >= 2:
                segments.append(coords)

    if not segments:
        return [], name

    # Ordered chaining: connect within 100m, split at larger gaps
    chain = list(segments[0])
    chains = []
    for i in range(1, len(segments)):
        seg = segments[i]
        d_fwd = coord_dist(chain[-1], seg[0])
        d_rev = coord_dist(chain[-1], seg[-1])
        best = min(d_fwd, d_rev)

        if best > 300:
            chains.append(chain)
            chain = list(seg if d_fwd <= d_rev else reversed(seg))
        elif d_fwd <= d_rev:
            chain.extend(seg[1:] if d_fwd < 100 else seg)
        else:
            chain.extend(list(reversed(seg))[1:] if d_rev < 100 else list(reversed(seg)))

    chains.append(chain)

    # Remove tiny fragments
    chains = [c for c in chains if seg_length(c) >= 500]
    return chains, name


def main():
    geojson_path = os.path.join(DATA_DIR, "geojson", "rail_lines.geojson")
    with open(geojson_path, encoding="utf-8") as f:
        geo = json.load(f)

    existing_ids = {f["properties"]["id"] for f in geo["features"]}

    # Relations to fetch: (relation_id, feature_id, description)
    targets = [
        # 宇都宮線 missing IDs
        (12213561, "line-12213561", "宇都宮線 (上り)"),
        (12210362, "line-12210362", "宇都宮線 (下り)"),
        # 中央・総武線各駅停車 missing IDs
        (3351488, "line-3351488", "中央線快速 (中央・総武線各駅停車で使用)"),
        (10312043, "line-10312043", "総武線各駅停車"),
        # 湘南新宿ライン - 再取得
        (4673470, "line-4673470", "湘南新宿ライン"),
        (5419188, "line-5419188", "湘南新宿ライン (高崎線方面)"),
        # 常磐線各駅停車 - 再取得
        (10025277, "line-10025277", "常磐線各駅停車"),
    ]

    added = 0
    updated = 0

    for rel_id, feat_id, desc in targets:
        print(f"\n=== {desc} (rel {rel_id}, {feat_id}) ===")

        time.sleep(REQUEST_DELAY)
        chains, osm_name = fetch_relation_geometry(rel_id)

        if not chains:
            print(f"  No geometry found")
            continue

        total_coords = sum(len(c) for c in chains)
        total_km = sum(seg_length(c) for c in chains) / 1000
        print(f"  OSM name: {osm_name}")
        print(f"  {len(chains)} chains, {total_coords} coords, {total_km:.1f}km")

        if len(chains) == 1:
            geometry = {"type": "LineString", "coordinates": chains[0]}
        else:
            geometry = {"type": "MultiLineString", "coordinates": chains}

        if feat_id in existing_ids:
            # Update existing
            for feat in geo["features"]:
                if feat["properties"]["id"] == feat_id:
                    old_coords = (
                        len(feat["geometry"]["coordinates"])
                        if feat["geometry"]["type"] == "LineString"
                        else sum(
                            len(s) for s in feat["geometry"]["coordinates"]
                        )
                    )
                    if total_coords > old_coords:
                        feat["geometry"] = geometry
                        feat["properties"]["name"] = osm_name
                        print(f"  Updated: {old_coords} -> {total_coords} coords")
                        updated += 1
                    else:
                        print(f"  Existing ({old_coords} coords) is better, skipping")
                    break
        else:
            # Add new
            geo["features"].append(
                {
                    "type": "Feature",
                    "properties": {
                        "id": feat_id,
                        "name": osm_name,
                    },
                    "geometry": geometry,
                }
            )
            print(f"  Added new feature")
            added += 1

    print(f"\n=== Summary: {added} added, {updated} updated ===")

    # Save
    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Saved: {geojson_path}")

    pub = os.path.join(PUBLIC_DIR, "geojson", "rail_lines.geojson")
    shutil.copy(geojson_path, pub)
    print(f"Copied: {pub}")


if __name__ == "__main__":
    main()
