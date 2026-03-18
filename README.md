# Tokyo Master - 東京地理クイズ

東京の地理を学ぶためのインタラクティブなクイズ・地図アプリケーション

## 機能

- **地理確認**: 東京の地図をレイヤー切り替えで探索（路線・川・道路・観光地）
- **地理クイズ**: 区/市・路線・テーマ別のクイズ（テキスト入力 & ドラッグ&ドロップ）
- **Achievement**: 実績管理とSNSシェア用画像生成

## 技術スタック

- React + Vite + TypeScript
- Leaflet + react-leaflet（地図表示）
- Zustand（状態管理）
- React Router（ルーティング）

## セットアップ

```bash
npm install
npm run dev
```

## 開発コマンド

| コマンド | 説明 |
|---------|------|
| `npm run dev` | 開発サーバー起動 |
| `npm run build` | プロダクションビルド |
| `npm run lint` | ESLint実行 |
| `npm run format` | Prettier実行 |
| `npm run format:check` | フォーマットチェック |

## ディレクトリ構成

```
src/
├── components/       # UIコンポーネント
│   ├── map/         # 地図関連コンポーネント
│   ├── quiz/        # クイズ関連コンポーネント
│   ├── achievement/ # Achievement関連コンポーネント
│   ├── common/      # 共通コンポーネント
│   └── home/        # ホーム画面コンポーネント
├── pages/           # ページコンポーネント
├── data/            # 静的地理データ（GeoJSON/JSON）
│   ├── geojson/     # 行政区域・路線・河川等のGeoJSON
│   ├── stations/    # 駅データ
│   └── lines/       # 路線データ
├── stores/          # Zustandストア
├── types/           # TypeScript型定義
├── utils/           # ユーティリティ関数
└── styles/          # CSSファイル
```
