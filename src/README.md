# src/ ディレクトリ

## 構成

| ディレクトリ | 説明 |
|-------------|------|
| `components/` | UIコンポーネント（map, quiz, achievement, common, home） |
| `pages/` | ページコンポーネント（HomePage, MapViewerPage, QuizPage, AchievementPage） |
| `data/` | 静的地理データ（GeoJSON, 駅データ, 路線データ） |
| `stores/` | Zustandストア（mapStore, quizStore, achievementStore） |
| `types/` | TypeScript型定義（geography, quiz, achievement） |
| `utils/` | ユーティリティ関数（距離計算, 名前マッチング） |
| `styles/` | CSSファイル |

## エントリーポイント

- `main.tsx` — アプリケーションのエントリーポイント
- `App.tsx` — ルーティング定義（React Router）
