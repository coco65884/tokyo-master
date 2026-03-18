#!/usr/bin/env python3
"""
ジャンル別POIデータを収集・キュレーションする。
Overpass API + 手動データでsrc/data/genre_pois.jsonを生成。
"""

import json
import os
import time
import urllib.request
import urllib.parse
from typing import Any

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "data")
OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def overpass_query(query: str) -> dict[str, Any]:
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    req = urllib.request.Request(OVERPASS_URL, data=data,
                                 headers={"User-Agent": "TokyoMaster/1.0"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            print(f"  Retry {attempt+1}: {e}")
            if attempt < 2: time.sleep(10)
    raise RuntimeError("Overpass query failed")


def extract_pois(result: dict, name_key: str = "name") -> list[dict[str, Any]]:
    pois = []
    seen = set()
    for elem in result["elements"]:
        tags = elem.get("tags", {})
        name = tags.get(name_key, tags.get("name", ""))
        if not name or name in seen:
            continue
        lat = elem.get("lat") or elem.get("center", {}).get("lat")
        lon = elem.get("lon") or elem.get("center", {}).get("lon")
        if not lat or not lon:
            continue
        seen.add(name)
        pois.append({"name": name, "lat": lat, "lng": lon})
    return pois


# ============================================================
# 1. 有名大学
# ============================================================
def collect_universities() -> list[dict]:
    print("[1] 大学を収集中...")
    query = """
    [out:json][timeout:60];
    area["name"="東京都"]["admin_level"="4"]->.tokyo;
    (
      way["amenity"="university"]["name"](area.tokyo);
      relation["amenity"="university"]["name"](area.tokyo);
      node["amenity"="university"]["name"](area.tokyo);
    );
    out center;
    """
    result = overpass_query(query)
    pois = extract_pois(result)
    # 有名大学をフィルタ
    famous = [
        "東京大学", "早稲田大学", "慶應義塾大学", "上智大学", "明治大学",
        "青山学院大学", "立教大学", "中央大学", "法政大学", "学習院大学",
        "東京理科大学", "東京工業大学", "一橋大学", "お茶の水女子大学",
        "東京都立大学", "東京藝術大学", "東京外国語大学", "東京農工大学",
        "東京学芸大学", "東京医科歯科大学", "東京海洋大学",
        "日本大学", "東洋大学", "駒澤大学", "専修大学", "國學院大學",
        "成蹊大学", "成城大学", "武蔵大学", "明治学院大学",
        "東京女子大学", "日本女子大学", "津田塾大学",
        "芝浦工業大学", "東京電機大学", "工学院大学",
        "国際基督教大学", "帝京大学", "拓殖大学", "大東文化大学",
    ]
    # 大学名で完全一致優先、なければ先頭一致でメインキャンパスのみ
    result = []
    for name in famous:
        exact = [u for u in pois if u["name"] == name]
        if exact:
            result.append(exact[0])
        else:
            partial = [u for u in pois if u["name"].startswith(name)]
            if partial:
                result.append({"name": name, "lat": partial[0]["lat"], "lng": partial[0]["lng"]})
    print(f"  {len(result)} universities")
    return result


# ============================================================
# 2. 主要ランドマーク（手動キュレーション）
# ============================================================
def get_landmarks() -> list[dict]:
    print("[2] ランドマーク (手動)...")
    landmarks = [
        {"name": "東京タワー", "lat": 35.6586, "lng": 139.7454},
        {"name": "東京スカイツリー", "lat": 35.7101, "lng": 139.8107},
        {"name": "レインボーブリッジ", "lat": 35.6370, "lng": 139.7636},
        {"name": "国会議事堂", "lat": 35.6760, "lng": 139.7450},
        {"name": "皇居", "lat": 35.6852, "lng": 139.7528},
        {"name": "東京駅", "lat": 35.6812, "lng": 139.7671},
        {"name": "東京ドーム", "lat": 35.7056, "lng": 139.7519},
        {"name": "武道館", "lat": 35.6932, "lng": 139.7500},
        {"name": "浅草寺", "lat": 35.7148, "lng": 139.7967},
        {"name": "明治神宮", "lat": 35.6764, "lng": 139.6993},
        {"name": "六本木ヒルズ", "lat": 35.6605, "lng": 139.7292},
        {"name": "渋谷スクランブルスクエア", "lat": 35.6590, "lng": 139.7006},
        {"name": "新宿御苑", "lat": 35.6852, "lng": 139.7100},
        {"name": "上野動物園", "lat": 35.7164, "lng": 139.7714},
        {"name": "築地場外市場", "lat": 35.6654, "lng": 139.7707},
        {"name": "豊洲市場", "lat": 35.6425, "lng": 139.7811},
        {"name": "お台場", "lat": 35.6267, "lng": 139.7753},
        {"name": "秋葉原電気街", "lat": 35.6984, "lng": 139.7731},
        {"name": "原宿竹下通り", "lat": 35.6708, "lng": 139.7027},
        {"name": "銀座四丁目交差点", "lat": 35.6717, "lng": 139.7649},
        {"name": "歌舞伎町", "lat": 35.6948, "lng": 139.7035},
        {"name": "池袋サンシャインシティ", "lat": 35.7290, "lng": 139.7193},
        {"name": "東京ビッグサイト", "lat": 35.6300, "lng": 139.7943},
        {"name": "東京ミッドタウン", "lat": 35.6657, "lng": 139.7313},
        {"name": "表参道ヒルズ", "lat": 35.6685, "lng": 139.7074},
        {"name": "増上寺", "lat": 35.6586, "lng": 139.7516},
        {"name": "靖国神社", "lat": 35.6940, "lng": 139.7441},
        {"name": "神田明神", "lat": 35.7020, "lng": 139.7681},
        {"name": "高尾山", "lat": 35.6254, "lng": 139.2436},
        {"name": "井の頭恩賜公園", "lat": 35.6997, "lng": 139.5740},
    ]
    print(f"  {len(landmarks)} landmarks")
    return landmarks


# ============================================================
# 3. ラーメン二郎（直系）
# ============================================================
def get_jiro() -> list[dict]:
    print("[3] ラーメン二郎 (手動)...")
    shops = [
        {"name": "三田本店", "lat": 35.6488, "lng": 139.7440},
        {"name": "目黒店", "lat": 35.6339, "lng": 139.7103},
        {"name": "仙川店", "lat": 35.6623, "lng": 139.5749},
        {"name": "歌舞伎町店", "lat": 35.6955, "lng": 139.7008},
        {"name": "新宿小滝橋通り店", "lat": 35.6998, "lng": 139.6981},
        {"name": "池袋東口店", "lat": 35.7318, "lng": 139.7159},
        {"name": "神田神保町店", "lat": 35.6963, "lng": 139.7573},
        {"name": "上野毛店", "lat": 35.6131, "lng": 139.6411},
        {"name": "品川店", "lat": 35.6227, "lng": 139.7419},
        {"name": "荻窪店", "lat": 35.7038, "lng": 139.6202},
        {"name": "八王子野猿街道店2", "lat": 35.6365, "lng": 139.3676},
        {"name": "めじろ台店", "lat": 35.6492, "lng": 139.3116},
        {"name": "府中店", "lat": 35.6696, "lng": 139.4755},
        {"name": "立川店", "lat": 35.6979, "lng": 139.4109},
        {"name": "新小金井街道店", "lat": 35.7128, "lng": 139.5260},
        {"name": "ひばりヶ丘駅前店", "lat": 35.7502, "lng": 139.5440},
        {"name": "環七一之江店", "lat": 35.6683, "lng": 139.8753},
        {"name": "亀戸店", "lat": 35.6952, "lng": 139.8262},
        {"name": "千住大橋駅前店", "lat": 35.7467, "lng": 139.8029},
        {"name": "赤羽店", "lat": 35.7786, "lng": 139.7209},
        {"name": "小岩店", "lat": 35.7320, "lng": 139.8808},
        {"name": "横浜関内店", "lat": 35.4445, "lng": 139.6381},
        {"name": "川崎店", "lat": 35.5309, "lng": 139.7010},
        {"name": "京成大久保店", "lat": 35.6842, "lng": 140.0275},
        {"name": "松戸駅前店", "lat": 35.7841, "lng": 139.9015},
    ]
    # 東京都内のみフィルタ
    tokyo_shops = [s for s in shops if 35.5 < s["lat"] < 35.9 and 139.0 < s["lng"] < 139.95]
    print(f"  {len(tokyo_shops)} shops (Tokyo)")
    return tokyo_shops


# ============================================================
# 4. 主要美術館・博物館
# ============================================================
def collect_museums() -> list[dict]:
    print("[4] 美術館・博物館を収集中...")
    query = """
    [out:json][timeout:60];
    area["name"="東京都"]["admin_level"="4"]->.tokyo;
    (
      node["tourism"="museum"]["name"](area.tokyo);
      way["tourism"="museum"]["name"](area.tokyo);
    );
    out center;
    """
    result = overpass_query(query)
    pois = extract_pois(result)
    # 有名どころをフィルタ
    famous_keywords = [
        "国立", "東京都", "森美術館", "国立新美術館", "根津美術館",
        "サントリー", "三菱", "出光", "Bunkamura", "東京都美術館",
        "上野の森", "国立西洋美術館", "国立科学博物館", "東京国立博物館",
        "江戸東京博物館", "写真美術館", "21_21", "ワタリウム",
        "ブリヂストン", "アーティゾン", "すみだ北斎美術館",
        "世田谷美術館", "練馬区立美術館", "府中市美術館",
        "ちひろ", "刀剣博物館", "鉄道博物館", "消防博物館",
        "貨幣博物館", "印刷博物館", "たばこと塩の博物館",
    ]
    filtered = [p for p in pois if any(k in p["name"] for k in famous_keywords)]
    if len(filtered) < 20:
        # 全museum を名前順で上位を取る
        filtered = sorted(pois, key=lambda x: x["name"])[:40]
    print(f"  {len(filtered)} museums")
    return filtered


# ============================================================
# 5. 主要公園
# ============================================================
def get_parks() -> list[dict]:
    print("[5] 公園 (手動)...")
    parks = [
        {"name": "新宿御苑", "lat": 35.6852, "lng": 139.7100},
        {"name": "代々木公園", "lat": 35.6717, "lng": 139.6949},
        {"name": "上野恩賜公園", "lat": 35.7146, "lng": 139.7726},
        {"name": "井の頭恩賜公園", "lat": 35.6997, "lng": 139.5740},
        {"name": "昭和記念公園", "lat": 35.7042, "lng": 139.3981},
        {"name": "葛西臨海公園", "lat": 35.6412, "lng": 139.8612},
        {"name": "お台場海浜公園", "lat": 35.6285, "lng": 139.7745},
        {"name": "浜離宮恩賜庭園", "lat": 35.6600, "lng": 139.7638},
        {"name": "六義園", "lat": 35.7326, "lng": 139.7451},
        {"name": "小石川後楽園", "lat": 35.7072, "lng": 139.7498},
        {"name": "日比谷公園", "lat": 35.6734, "lng": 139.7560},
        {"name": "芝公園", "lat": 35.6554, "lng": 139.7480},
        {"name": "砧公園", "lat": 35.6316, "lng": 139.6168},
        {"name": "駒沢オリンピック公園", "lat": 35.6263, "lng": 139.6611},
        {"name": "光が丘公園", "lat": 35.7590, "lng": 139.6296},
        {"name": "石神井公園", "lat": 35.7375, "lng": 139.5977},
        {"name": "善福寺公園", "lat": 35.7142, "lng": 139.5901},
        {"name": "水元公園", "lat": 35.7833, "lng": 139.8693},
        {"name": "舎人公園", "lat": 35.7902, "lng": 139.7639},
        {"name": "夢の島公園", "lat": 35.6479, "lng": 139.8314},
        {"name": "等々力渓谷", "lat": 35.6063, "lng": 139.6473},
        {"name": "明治神宮外苑", "lat": 35.6780, "lng": 139.7158},
        {"name": "清澄庭園", "lat": 35.6811, "lng": 139.7984},
        {"name": "旧芝離宮恩賜庭園", "lat": 35.6554, "lng": 139.7570},
        {"name": "小金井公園", "lat": 35.7220, "lng": 139.5118},
    ]
    print(f"  {len(parks)} parks")
    return parks


# ============================================================
# 6. スタジアム・アリーナ
# ============================================================
def get_stadiums() -> list[dict]:
    print("[6] スタジアム (手動)...")
    stadiums = [
        {"name": "国立競技場", "lat": 35.6776, "lng": 139.7145},
        {"name": "東京ドーム", "lat": 35.7056, "lng": 139.7519},
        {"name": "味の素スタジアム", "lat": 35.6645, "lng": 139.5272},
        {"name": "日本武道館", "lat": 35.6932, "lng": 139.7500},
        {"name": "両国国技館", "lat": 35.6969, "lng": 139.7929},
        {"name": "神宮球場", "lat": 35.6747, "lng": 139.7177},
        {"name": "秩父宮ラグビー場", "lat": 35.6736, "lng": 139.7185},
        {"name": "有明アリーナ", "lat": 35.6370, "lng": 139.7893},
        {"name": "東京体育館", "lat": 35.6802, "lng": 139.7135},
        {"name": "駒沢陸上競技場", "lat": 35.6275, "lng": 139.6620},
        {"name": "東京武道館", "lat": 35.7613, "lng": 139.8211},
        {"name": "大井競馬場", "lat": 35.5878, "lng": 139.7410},
        {"name": "東京競馬場", "lat": 35.6622, "lng": 139.4830},
        {"name": "代々木第一体育館", "lat": 35.6678, "lng": 139.6993},
    ]
    print(f"  {len(stadiums)} stadiums")
    return stadiums


# ============================================================
# 7. 有名高校
# ============================================================
def get_high_schools() -> list[dict]:
    print("[7] 有名高校 (手動)...")
    schools = [
        {"name": "開成高校", "lat": 35.7400, "lng": 139.7582},
        {"name": "筑波大学附属駒場高校", "lat": 35.6527, "lng": 139.6665},
        {"name": "桜蔭高校", "lat": 35.7074, "lng": 139.7569},
        {"name": "麻布高校", "lat": 35.6548, "lng": 139.7273},
        {"name": "駒場東邦高校", "lat": 35.6503, "lng": 139.6783},
        {"name": "武蔵高校", "lat": 35.7363, "lng": 139.5989},
        {"name": "女子学院高校", "lat": 35.6910, "lng": 139.7429},
        {"name": "雙葉高校", "lat": 35.6891, "lng": 139.7358},
        {"name": "豊島岡女子学園高校", "lat": 35.7243, "lng": 139.7173},
        {"name": "海城高校", "lat": 35.7019, "lng": 139.7018},
        {"name": "早稲田高校", "lat": 35.7087, "lng": 139.7205},
        {"name": "渋谷教育学園渋谷高校", "lat": 35.6549, "lng": 139.7024},
        {"name": "日比谷高校", "lat": 35.6636, "lng": 139.7443},
        {"name": "西高校", "lat": 35.7075, "lng": 139.6127},
        {"name": "国立高校", "lat": 35.6945, "lng": 139.4416},
        {"name": "戸山高校", "lat": 35.6999, "lng": 139.7058},
        {"name": "青山高校", "lat": 35.6718, "lng": 139.7149},
        {"name": "小石川中等教育学校", "lat": 35.7190, "lng": 139.7448},
        {"name": "筑波大学附属高校", "lat": 35.7180, "lng": 139.7349},
        {"name": "東京学芸大学附属高校", "lat": 35.6505, "lng": 139.6556},
        {"name": "巣鴨高校", "lat": 35.7368, "lng": 139.7234},
        {"name": "本郷高校", "lat": 35.7473, "lng": 139.7415},
        {"name": "広尾学園高校", "lat": 35.6517, "lng": 139.7227},
        {"name": "芝高校", "lat": 35.6551, "lng": 139.7446},
        {"name": "攻玉社高校", "lat": 35.6278, "lng": 139.7125},
        {"name": "世田谷学園高校", "lat": 35.6448, "lng": 139.6648},
        {"name": "暁星高校", "lat": 35.6928, "lng": 139.7455},
        {"name": "白百合学園高校", "lat": 35.6934, "lng": 139.7418},
        {"name": "城北高校", "lat": 35.7583, "lng": 139.6849},
        {"name": "桐朋高校", "lat": 35.6864, "lng": 139.4406},
    ]
    print(f"  {len(schools)} schools")
    return schools


# ============================================================
# メイン
# ============================================================
def main() -> None:
    print("=" * 50)
    print("ジャンル別POIデータ収集")
    print("=" * 50)

    genres: dict[str, Any] = {}

    genres["universities"] = {
        "label": "有名大学",
        "icon": "🎓",
        "pois": collect_universities(),
    }
    time.sleep(5)

    genres["landmarks"] = {
        "label": "主要ランドマーク",
        "icon": "🗼",
        "pois": get_landmarks(),
    }

    genres["jiro"] = {
        "label": "ラーメン二郎（直系）",
        "icon": "🍜",
        "pois": get_jiro(),
    }

    genres["museums"] = {
        "label": "美術館・博物館",
        "icon": "🏛️",
        "pois": collect_museums(),
    }
    time.sleep(5)

    genres["parks"] = {
        "label": "公園・庭園",
        "icon": "🌳",
        "pois": get_parks(),
    }

    genres["stadiums"] = {
        "label": "スタジアム・アリーナ",
        "icon": "🏟️",
        "pois": get_stadiums(),
    }

    genres["high_schools"] = {
        "label": "有名高校",
        "icon": "🏫",
        "pois": get_high_schools(),
    }

    # 保存
    outpath = os.path.join(DATA_DIR, "genre_pois.json")
    with open(outpath, "w", encoding="utf-8") as f:
        json.dump(genres, f, ensure_ascii=False, indent=2)
    print(f"\nSaved: {outpath}")

    for key, genre in genres.items():
        print(f"  {genre['icon']} {genre['label']}: {len(genre['pois'])}件")

    total = sum(len(g["pois"]) for g in genres.values())
    print(f"\nTotal: {total}件")


if __name__ == "__main__":
    main()
