# Zustand

## 技術名
**Zustand** — 軽量なReact状態管理ライブラリ（ドイツ語で「状態」の意味）

## 概要

ZustandはReactアプリケーション向けの軽量な状態管理ライブラリ。Reduxのような複雑なボイラープレートなしに、シンプルなAPIでグローバルな状態管理を実現する。`create()` 関数でストアを作成し、Reactのフック（`useStore()`）として利用するだけで使える。

## 導入した目的

このプロジェクトでは、複数の画面・コンポーネント間で以下の状態を共有する必要がある:
- **地図の状態**: 表示位置、ズームレベル、レイヤーのON/OFF
- **クイズの状態**: 出題設定、回答履歴、正答率
- **Achievementの状態**: 各実績の達成状況

Zustandを使うことで、これらの状態をシンプルかつ効率的に管理できる。`persist` ミドルウェアを使えばlocalStorageへの自動保存も簡単に実装可能。

## メリット

| メリット | 説明 |
|---------|------|
| シンプル | ボイラープレートが少なく、学習コストが低い |
| 軽量 | バンドルサイズが約1KB |
| TypeScript対応 | 型推論が優秀で型定義が容易 |
| 永続化 | `persist` ミドルウェアでlocalStorage保存が簡単 |
| 再レンダリング最適化 | 必要な状態だけを選択して購読でき、不要な再レンダリングを防ぐ |

## プロジェクト内での使われ方

### 基本的なストア作成

```typescript
// src/stores/mapStore.ts
import { create } from 'zustand';

// create() でストアを定義
// set() で状態を更新
const useMapStore = create<MapState>((set) => ({
  center: [35.6762, 139.6503],  // 初期状態
  zoom: 11,
  setCenter: (center) => set({ center }),  // 状態更新関数
  setZoom: (zoom) => set({ zoom }),
}));
```

### コンポーネントでの使用

```tsx
// Reactコンポーネント内でフックとして利用
// 必要なプロパティだけを選択（セレクタ）して購読
function TokyoMap() {
  const center = useMapStore((s) => s.center);  // centerだけを購読
  const zoom = useMapStore((s) => s.zoom);
  // centerやzoomが変わった時だけ再レンダリングされる
}
```

### localStorageへの永続化

```typescript
// src/stores/quizStore.ts
import { persist } from 'zustand/middleware';

// persist() でラップするだけでlocalStorageに自動保存
const useQuizStore = create<QuizState>()(
  persist(
    (set, get) => ({
      results: [],
      addResult: (result) => set((state) => ({
        results: [...state.results, result],
      })),
    }),
    { name: 'tokyo-master-quiz' },  // localStorageのキー名
  ),
);
```
