# 地理データ管理ガイド

## 概要

本アプリの地理データは OpenStreetMap (OSM) の Overpass API から収集し、複数のPythonスクリプトで加工してフロントエンドに配信する。このドキュメントはデータの出所、加工パイプライン、既知の問題パターン、修正手順を記録する。

## データソース

| データ | ソース | ライセンス |
|--------|--------|------------|
| 区市町村境界 | OSM Overpass (`admin_level=7,8`) | ODbL |
| 鉄道路線 | OSM Overpass (`route=train/subway/monorail/light_rail`) | ODbL |
| 駅 | OSM Overpass (`railway=station/stop`) | ODbL |
| 河川 | OSM Overpass (`waterway=river`, 名前フィルタ) | ODbL |
| 道路 | OSM Overpass (`highway=trunk/primary`, 名前フィルタ) | ODbL |
| 大学・高校 | Overpass API + 手動座標検証 | ODbL + 手動 |
| ランドマーク・公園・博物館等 | 手動キュレーション + Overpass | 手動 + ODbL |

**Overpass API エンドポイント**: `https://overpass-api.de/api/interpreter`
**リクエスト間隔**: 10秒（レートリミット準拠）

## ファイル構成

### GeoJSON（地図表示用）— `src/data/geojson/`

| ファイル | 内容 | Feature Type | 件数 |
|---------|------|-------------|------|
| `wards.geojson` | 東京都62区市町村境界 | Polygon/MultiPolygon | 62 |
| `pref_borders.geojson` | 都県境界線 | LineString | 4 |
| `rail_lines.geojson` | 鉄道路線パス | LineString/MultiLineString | 319 |
| `stations.geojson` | 駅位置 | Point | 3,317 |
| `rivers.geojson` | 主要河川 | LineString/MultiLineString | 17 |
| `roads.geojson` | 主要道路 | LineString/MultiLineString | 40 |
| `landmarks.geojson` | 観光地・名所 | Point | 1,000+ |

### メタデータJSON — `src/data/`

| ファイル | 内容 |
|---------|------|
| `lines/line_index.json` | 事業者→路線→駅の階層インデックス |
| `lines/lines.json` | 路線メタデータ（名前、カラー、駅ID） |
| `stations/stations.json` | 駅メタデータ（多言語名、座標、所属路線） |
| `wards.json` | 区市町村メタデータ（名前、種別） |
| `ward_centers.json` | 区市町村の中心座標 |
| `ward_objects.json` | 区→路線/河川/道路の関連マッピング |
| `rivers.json` | 河川メタデータ（多言語名） |
| `roads.json` | 道路メタデータ（多言語名） |
| `genre_pois.json` | テーマ別POI（大学、ランドマーク等） |

### `public/data/`

フロントエンドからHTTP fetchで読み込むファイル。`line_index.json`, `ward_centers.json`, `ward_objects.json`, `geojson/` が配置される。`npm run build` 時に `dist/data/` にコピーされる。

## データ加工パイプライン

```
collect_data.py          # 1. Overpass APIからraw取得
  ↓
dedup_rail_features.py   # 2. 上下線の重複排除
  ↓
fix_rail_jumps.py        # 3. 500m超ジャンプの分割
  ↓
interpolate_gaps.py      # 4. 駅間ギャップの補間
fix_internal_gaps.py     # 4b. 内部ギャップの修正
  ↓
add_missing_lines.py     # 5. 未取得路線の追加取得
  ↓
fix_station_names.py     # 6. 無名stop_positionの駅名付与
  ↓
sort_stations.py         # 7. 駅を始発→終点順にソート
  ↓
rebuild_line_index.py    # 8. line_index.json の構築
  ↓
filter_major_roads.py    # 9. 主要道路のフィルタリング
  ↓
optimize_geojson.py      # 10. 座標精度削減（5桁）+ minify
```

### 実行方法

```bash
# 全データ再収集（Overpass APIにアクセスするため時間がかかる）
python3 scripts/collect_data.py

# 路線データの後処理
python3 scripts/dedup_rail_features.py
python3 scripts/fix_rail_jumps.py
python3 scripts/interpolate_gaps.py
python3 scripts/fix_internal_gaps.py
python3 scripts/fix_station_names.py
python3 scripts/sort_stations.py
python3 scripts/rebuild_line_index.py

# 道路フィルタ
python3 scripts/filter_major_roads.py

# 最適化
python3 scripts/optimize_geojson.py

# ジャンルPOI収集（大学・博物館等）
python3 scripts/collect_genre_pois.py
```

## 既知の問題パターンと対処法

### 1. 路線の上下線重複
**症状**: 路線が2本線として表示される
**原因**: OSMのrouteリレーションに上り/下りの2方向分のwayが含まれる
**対処**: `dedup_rail_features.py` で座標数最大のfeatureを残す。完全ではないため、近接する2線を1線に統合するアルゴリズムの改善が必要。

### 2. 路線の断絶・不正セグメント
**症状**: 線路が途切れる、または存在しない場所に線が引かれる
**原因**: OSMデータの欠損、wayの接続不良、回送線の混入
**対処**: `fix_rail_jumps.py`（500m超分割）+ `interpolate_gaps.py`（補間）。バリデーションスクリプトで残存問題を検出する仕組みが必要。

### 3. 終点からの線路はみ出し
**症状**: 終点駅を超えて線路が表示される
**原因**: 車庫への引き込み線、回送線のジオメトリが混入
**対処**: 始発/終点駅の座標でLineStringをクリップするスクリプトを作成する。

### 4. POI座標のずれ
**症状**: 大学・高校が線路上や別の区に配置される
**原因**: OSMのノード座標が建物の代表点でない（入口点や最寄り道路上のノード）
**対処**: Googleマップ等で実際の校舎位置を確認し、手動で修正。区ポリゴンとの包含チェックを自動化する。

### 5. 道路・河川の断片化
**症状**: 同名の道路/河川がとぎれとぎれに表示される
**原因**: OSMでは1つの道路が多数のway（セグメント）で構成される
**対処**: 同名featureをMultiLineStringに統合し、端点が近いセグメントを接続する。

### 6. 同名短区間道路の混入
**症状**: 中央通り等の一般的な名前で、短い無関係な区間まで表示される
**原因**: 東京中の同名道路を名前だけでフィルタしている
**対処**: 同名道路をクラスタリングし、最長クラスタのみ保持。短い独立クラスタは除外。

## POI座標の検証手順

genre_pois.json の座標を検証・修正する際の手順:

1. **自動チェック**: 各POIが正しい区ポリゴン内にあるか確認
   ```python
   # point-in-polygon チェック（shapely使用例）
   from shapely.geometry import Point, shape
   point = Point(lng, lat)
   ward_polygon = shape(ward_feature['geometry'])
   assert ward_polygon.contains(point), f"{poi_name} is outside {ward_name}"
   ```

2. **目視確認**: Googleマップで `{lat},{lng}` を検索し、実際の施設位置と照合

3. **修正**: `genre_pois.json` の lat/lng を更新。コミットメッセージに修正理由を記載
   ```
   fix: {施設名}の座標を修正（Googleマップ確認値）
   ```

## 路線データの検証手順

1. **セグメント距離チェック**: 各LineStringの連続する座標点間の距離を計算し、500m超のジャンプを検出
2. **終点チェック**: LineStringの端点と始発/終点駅の距離を計算し、異常に遠い場合を検出
3. **目視確認**: 問題のある路線をブラウザのdev modeで地図上に表示して確認

## コーディング規約

- GeoJSONの座標は5桁精度（約1.1m）に丸める
- スクリプトは冪等（何度実行しても同じ結果）に設計する
- データ修正は手動JSONの直接編集より、スクリプトの改善を優先する
- 手動修正が必要な場合は、修正理由をコミットメッセージに明記する
- 新しい加工ステップを追加した場合はこのドキュメントのパイプライン図を更新する
