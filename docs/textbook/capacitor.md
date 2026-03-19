# Capacitor

## 技術名
**Capacitor** — IonicチームによるWebアプリをネイティブアプリに変換するフレームワーク

## 概要

CapacitorはReact/Vue/Angular等で作ったWebアプリを、iOS/Androidのネイティブアプリとしてパッケージングするフレームワーク。`npm run build`で生成された静的ファイル（HTML/CSS/JS）を、iOSのWKWebView（Androidの場合はWebView）内で表示する仕組み。

React NativeやFlutterと違い、**既存のWebアプリをそのまま使える**のが最大の特徴。UIの書き直しは不要。

## 導入した目的

Tokyo MasterのReact + Viteアプリを、iPhoneのApp Storeで配信可能なネイティブアプリに変換するため。Webアプリのコードはそのまま維持しつつ、ネイティブアプリの配信チャネルを追加できる。

## メリット

| メリット | 説明 |
|---------|------|
| コード共有 | Web版とネイティブ版で同一のReactコード |
| 学習コスト低 | Web開発の知識だけでネイティブアプリ作成 |
| ネイティブ機能 | カメラ、GPS、プッシュ通知等にアクセス可能 |
| 段階的導入 | まずPWA → 必要になったらCapacitorでApp Store配信 |
| 高品質WebView | iOS: WKWebView（Safari同等のパフォーマンス） |

## PWAとの比較

| | PWA | Capacitor |
|---|-----|-----------|
| インストール | ホーム画面に追加 | App Store/Google Play |
| オフライン | Service Worker | WebView内蔵ファイル |
| ネイティブAPI | 限定的 | フルアクセス |
| 審査 | 不要 | Apple/Google審査あり |
| コスト | 無料 | Apple Developer $99/年 |
| 配布 | URL共有 | ストア経由 |

## プロジェクト内での使われ方

### ファイル構成

```
tokyo_master/
├── capacitor.config.ts   ← Capacitor設定
├── dist/                 ← npm run build の出力（Webアプリ）
├── ios/                  ← Xcodeプロジェクト（npx cap add ios で生成）
│   └── App/
│       └── App/
│           └── public/   ← dist/ の内容がここにコピーされる
└── src/                  ← Webアプリのソースコード
```

### ビルドフロー

```bash
# 1. Webアプリをビルド
npm run build
# → dist/ にHTML/CSS/JSが生成される

# 2. Capacitorでネイティブプロジェクトに同期
npx cap sync
# → dist/ の内容が ios/App/App/public/ にコピーされる

# 3. Xcodeで開いてビルド
npx cap open ios
```

### capacitor.config.ts の設定例

```typescript
const config: CapacitorConfig = {
  appId: 'com.tokyomaster.app',  // App StoreのバンドルID
  appName: 'Tokyo Master',
  webDir: 'dist',                // ビルド出力ディレクトリ
  ios: {
    contentInset: 'automatic',   // Safe Area自動対応
  },
};
```
