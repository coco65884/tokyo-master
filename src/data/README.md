# src/data/ - 静的地理データ

OpenStreetMap Overpass API から収集した東京の地理データ。

## ディレクトリ構成

| パス | 説明 |
|------|------|
| `geojson/wards.geojson` | 東京都62区市町村の境界ポリゴン |
| `geojson/pref_borders.geojson` | 東京・神奈川・埼玉・千葉の都県境界線 |
| `geojson/rail_lines.geojson` | 鉄道路線パス（319路線） |
| `geojson/stations.geojson` | 駅位置（3,317駅） |
| `geojson/rivers.geojson` | 主要河川（17河川） |
| `geojson/roads.geojson` | 主要道路（環七、環八、甲州街道等） |
| `geojson/landmarks.geojson` | 観光地・名所 |
| `wards.json` | 区市町村メタデータ |
| `lines/lines.json` | 路線メタデータ（路線名、事業者、カラー、駅ID） |
| `stations/stations.json` | 駅メタデータ（名前、座標、所属路線） |
| `rivers.json` | 河川メタデータ |
| `roads.json` | 道路メタデータ |
| `landmarks.json` | 観光地メタデータ |

## データの再収集

```bash
python3 scripts/collect_data.py     # Overpass APIからデータ収集
python3 scripts/optimize_geojson.py # GeoJSONの最適化（座標精度削減）
```

## データソース

- OpenStreetMap (https://www.openstreetmap.org/) - ODbL ライセンス

## 詳細ドキュメント

データの加工パイプライン、既知の問題パターン、修正手順については `docs/geodata-management.md` を参照。
