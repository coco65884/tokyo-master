# PWA (Progressive Web App)

## 技術名
**PWA** — Webアプリをネイティブアプリのように動作させる技術の総称

## 概要

PWAは、通常のWebサイトにService Worker、Web App Manifest等の技術を追加することで、インストール可能・オフライン対応・プッシュ通知対応のアプリとして動作させる仕組み。App StoreやGoogle Playを経由せずに配布できる。

## 導入した目的

Tokyo MasterをiPhoneのホーム画面に追加してネイティブアプリのように使えるようにするため。サーバーレスで運用でき、App Storeへの提出も不要なため、コストゼロでアプリ体験を提供できる。

## メリット

| メリット | 説明 |
|---------|------|
| インストール不要 | URLにアクセスするだけ、ホーム画面に追加で「アプリ化」 |
| オフライン対応 | Service Workerで地図タイルやデータをキャッシュ |
| 自動更新 | 新バージョンのデプロイ時に自動でService Worker更新 |
| コストゼロ | App Store登録費($99/年)不要 |
| クロスプラットフォーム | iOS/Android/デスクトップ全て同一コード |

## プロジェクト内での使われ方

### vite-plugin-pwa の設定

```typescript
// vite.config.ts
VitePWA({
  registerType: 'autoUpdate',  // 自動更新
  manifest: {
    name: 'Tokyo Master - 東京地理クイズ',
    short_name: 'Tokyo Master',
    display: 'standalone',      // ブラウザUIを非表示
    theme_color: '#1a73e8',
    icons: [...]
  },
  workbox: {
    runtimeCaching: [
      // 地図タイルを30日間キャッシュ
      { urlPattern: /basemaps\.cartocdn\.com/, handler: 'CacheFirst' },
      // GeoJSONデータを7日間キャッシュ
      { urlPattern: /\/data\//, handler: 'CacheFirst' },
    ]
  }
})
```

### iOSでの利用方法
1. Safariで `https://tokyo-master.vercel.app` にアクセス
2. 共有ボタン → 「ホーム画面に追加」
3. ホーム画面にアイコンが追加され、フルスクリーンで動作
