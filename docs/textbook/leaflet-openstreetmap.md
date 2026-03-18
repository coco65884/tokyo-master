# Leaflet + OpenStreetMap

## 技術名
- **Leaflet**: オープンソースのJavaScript地図ライブラリ
- **OpenStreetMap (OSM)**: オープンソースの地図データプロジェクト
- **react-leaflet**: LeafletのReactラッパー

## 概要

**Leaflet** は軽量（約42KB）でモバイルフレンドリーなインタラクティブ地図ライブラリ。地図のパン、ズーム、マーカー、ポリゴン描画など地図操作に必要な機能を網羅している。

**OpenStreetMap** は世界中のボランティアが作成・維持するフリーの地図データ。Google Mapsと違い、APIキー不要・利用料金なしで地図タイルを使用可能（ただし大量アクセス時はタイルサーバーを自前で用意するのが望ましい）。

**react-leaflet** はLeafletをReactコンポーネントとして使えるようにするラッパー。`<MapContainer>`, `<TileLayer>`, `<Marker>` などのReactコンポーネントでLeafletの機能を宣言的に利用できる。

## 導入した目的

東京の地理を可視化し、区/市の境界、路線、河川、道路、観光地などをレイヤーとして地図上に表示するため。Google Mapsは無料枠に制限があるが、Leaflet + OSMは完全無料で利用でき、プロジェクトのコスト最小化要件を満たす。

## メリット

| メリット | 説明 |
|---------|------|
| 完全無料 | OSMのタイルは無料で利用可能 |
| 軽量 | ライブラリサイズが小さく、読み込みが速い |
| カスタマイズ性 | GeoJSONオーバーレイで独自のレイヤーを自由に追加可能 |
| レイヤー管理 | 複数のレイヤーをプログラムで表示/非表示切り替え |
| イベント処理 | クリック、ドラッグ等のイベントをハンドリング可能 |

## プロジェクト内での使われ方

### 基本的な地図表示

```tsx
// src/components/map/TokyoMap.tsx
import { MapContainer, TileLayer } from 'react-leaflet';

// 東京を中心とした地図を表示
<MapContainer center={[35.6762, 139.6503]} zoom={11}>
  {/* OpenStreetMapのタイルレイヤーを表示 */}
  <TileLayer
    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    attribution="&copy; OpenStreetMap contributors"
  />
</MapContainer>
```

### 地図のクリックイベント

```tsx
// useMapEventsフックで地図のクリック位置を取得
// 2点間の距離計測に使用している
function MapClickHandler() {
  useMapEvents({
    click(e) {
      // e.latlng.lat, e.latlng.lng でクリック位置の緯度経度を取得
      addDistancePoint([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}
```

### GeoJSONレイヤー（今後実装予定）

```tsx
// GeoJSONデータを地図上にオーバーレイ表示する
// 区の境界線、路線パス、河川などに使用予定
import { GeoJSON } from 'react-leaflet';

<GeoJSON
  data={wardBoundaries}  // GeoJSONデータ
  style={{ color: '#333', weight: 2 }}  // 表示スタイル
/>
```
