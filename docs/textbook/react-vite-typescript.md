# React + Vite + TypeScript

## 技術名
- **React**: UIライブラリ（Meta社開発）
- **Vite**: 高速ビルドツール（Evan You開発）
- **TypeScript**: JavaScriptの型付き拡張言語（Microsoft開発）

## 概要

**React** はコンポーネントベースのUIライブラリ。UIを小さなコンポーネント（部品）に分けて開発し、それらを組み合わせて画面を構築する。仮想DOMにより効率的な画面更新を行う。

**Vite** は次世代のフロントエンドビルドツール。ESモジュールのネイティブサポートにより、従来のWebpack等に比べて非常に高速な開発サーバーの起動とHMR（Hot Module Replacement = ファイル変更の即時反映）を提供する。

**TypeScript** はJavaScriptに静的型付けを追加した言語。コンパイル時にエラーを検出できるため、大規模な開発やリファクタリングが安全に行える。

## 導入した目的

このプロジェクトでは、東京の地図やクイズなど複雑なUIを効率的に開発する必要がある。Reactのコンポーネントベース設計により、地図コンポーネント、クイズコンポーネント、Achievement表示コンポーネントなどを独立して開発・テスト可能。TypeScriptにより地理データの型（駅、路線、区など）を厳密に定義し、データの不整合を防ぐ。Viteにより開発中の変更が瞬時に反映され、素早いフィードバックループで開発できる。

## メリット

| メリット | 説明 |
|---------|------|
| コンポーネント再利用 | 地図レイヤー、クイズの回答欄などを部品として再利用可能 |
| 型安全 | TypeScriptにより駅データ・路線データの構造を厳密に定義 |
| 高速開発 | ViteのHMRで変更が100ms以内に反映 |
| エコシステム | react-leaflet, zustand等の豊富なライブラリが利用可能 |
| 将来のアプリ化 | React NativeでiOSアプリへの移行が容易 |

## プロジェクト内での使われ方

### Reactコンポーネントの例

```tsx
// src/components/map/TokyoMap.tsx
// MapContainerはreact-leafletが提供するReactコンポーネント
// Reactのコンポーネントとして地図をレンダリングしている
<MapContainer center={center} zoom={zoom}>
  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
</MapContainer>
```

### TypeScriptの型定義の例

```typescript
// src/types/geography.ts
// 駅データに必要な情報を型として定義
// これにより、間違ったフィールド名やデータ型を使うとコンパイルエラーになる
interface Station {
  id: string;
  name: NameVariants;  // 漢字/ひらがな/カタカナ/ローマ字
  lat: number;
  lng: number;
  lineIds: string[];
}
```

### Viteの設定例

```typescript
// vite.config.ts
// パスエイリアス「@/」を設定し、深いインポートパスを簡潔にしている
// import { Station } from '@/types' のように書ける
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```
