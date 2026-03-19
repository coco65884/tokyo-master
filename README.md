# Tokyo Master

**東京の地理を学ぶインタラクティブなクイズ・地図アプリ**

路線・駅・区・川・道路を地図上で確認し、クイズで知識を定着させるWebアプリケーションです。PWA対応で、iPhoneのホーム画面に追加すればオフラインでも動作します。

## 主な機能

### 地理確認
- 白地図ベースの東京地図
- 路線（JR・メトロ・都営・私鉄14社）を地図記号風に表示
- 川・主要道路のレイヤー切り替え
- 区フォーカスモード（選択した区の路線・川・道路をハイライト）
- テーマ別POI表示（大学・ランドマーク・ラーメン二郎・公園・美術館等）
- 2点間の直線距離計測
- 正答率ヒートマップ

### 地理クイズ
- **路線クイズ**: 公式駅番号順（JY01, JC01等）に駅名を回答
- **区/市クイズ**: 区内の駅・川を回答
- **テーマクイズ**: 河川・大学・二郎・高校・公園等8ジャンル
- **スピードラン**: タイムアタック形式
- **白地図クイズ**: 区名を当てるモード
- 表記揺れ対応（漢字・ひらがな・ローマ字）
- 結果を地図上で確認可能

### Achievement
- 路線別・区別・テーマ別の実績バッジ
- html2canvasによるSNSシェア画像生成

## セットアップ

```bash
git clone https://github.com/<your-username>/tokyo_master.git
cd tokyo_master
npm install
npm run dev
```

## 開発コマンド

| コマンド | 説明 |
|---------|------|
| `npm run dev` | 開発サーバー起動 |
| `npm run build` | プロダクションビルド |
| `npm run lint` | ESLint |
| `npm run format` | Prettierフォーマット |
| `npm run format:check` | フォーマットチェック |
| `npm run cap:build` | Capacitorビルド（iOS/Android） |

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フロントエンド | React + Vite + TypeScript |
| 地図 | Leaflet + react-leaflet + CartoDB Positron |
| 状態管理 | Zustand（localStorage永続化） |
| ルーティング | React Router |
| PWA | vite-plugin-pwa + Workbox |
| ネイティブ | Capacitor（iOS/Android対応） |
| デプロイ | Vercel |

## データソース

地理データはOpenStreetMap（Overpass API）から取得し、静的JSONとして同梱しています。

- 路線・駅データ: 74路線、約1,600駅
- 行政区域: 東京都62区市町村の境界GeoJSON
- 河川: 17主要河川
- 道路: 36主要幹線道路
- テーマPOI: 大学38校、ランドマーク30件、二郎23店舗 等

## ライセンス

MIT License - 詳細は [LICENSE](LICENSE) を参照

### データのライセンス

- 地図タイル: [CartoDB](https://carto.com/) (CC BY 3.0)
- 地理データ: [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL)
