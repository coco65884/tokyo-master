# ネイティブアプリビルド手順

## 前提条件

### iOS
- macOS
- Xcode 15以上
- Apple Developer Program ($99/年) ※App Store配信の場合

## セットアップ（初回のみ）

```bash
# 1. 依存パッケージのインストール
npm install

# 2. iOSプラットフォーム追加
npx cap add ios

# 3. Webアプリをビルドしてネイティブプロジェクトに同期
npm run cap:build
```

## 開発フロー

```bash
# Webアプリを変更した後
npm run build          # Webアプリをビルド
npx cap sync           # dist/ をiOSプロジェクトにコピー
npx cap open ios       # Xcodeで開く

# ワンコマンド
npm run cap:build      # build + sync
```

## Xcodeでの操作

1. `npm run cap:open:ios` でXcodeが開く
2. Signing & Capabilities でチーム（Apple ID）を設定
3. シミュレータまたは実機を選択
4. ▶ ビルド & 実行

## App Store提出

1. Xcodeで Product → Archive
2. Distribute App → App Store Connect
3. App Store Connectでアプリ情報を入力
4. 審査に提出

## 注意事項

- `ios/` と `android/` はgitignoreに追加済み（環境依存のため）
- 初回は `npx cap add ios` でプロジェクト生成が必要
- Capacitorの設定は `capacitor.config.ts` で管理
- Webアプリの変更後は必ず `npx cap sync` を実行

## トラブルシューティング

### ビルドが失敗する場合
```bash
# キャッシュクリア
rm -rf ios/App/App/public
npx cap sync
```

### Safariデバッグ
1. iPhoneの設定 → Safari → 詳細 → Webインスペクタ ON
2. MacのSafari → 開発メニュー → デバイス名 → localhost
