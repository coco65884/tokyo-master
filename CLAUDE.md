# 開発ルール

## 基本方針
* GitHub Issues でタスクを管理する。`priority:critical` → `priority:high` の順に優先度の高いタスクから実行
* 新しいライブラリやツールを導入した場合は `docs/textbook/<topic>.md` に技術紹介を作成
* ユーザーの作業が必要な場合は `needs:human` ラベル付きの Issue を作成

## Git運用ルール

### ブランチ戦略
- 作業は必ず `feature/<TASK-ID>-<description>` ブランチで行う
- mainへの直接pushは原則禁止

### コミットメッセージ形式
- `feat:` 新機能追加
- `fix:` バグ修正
- `data:` データ収集・更新
- `infra:` CI/CD, 設定, インフラ変更

### 作業フロー
```bash
# 1. Issue取得
gh issue edit <NUMBER> --add-assignee "@me" --add-label "agent:claimed"

# 2. ブランチ作成
git checkout -b feature/<TASK-ID>-<description> main

# 3. 実装 → テスト → commit
npm run build && npm run lint && npm run format:check
git commit -m "feat: <TASK-ID> <description>

Closes #<ISSUE-NUMBER>"

# 4. push → PR → merge
git push -u origin feature/<TASK-ID>-<description>
gh pr create --title "..." --body "Closes #<NUMBER>" --base main
```

## 品質チェック
- `npm run build` — TypeScript型チェック + Viteビルド
- `npm run lint` — ESLint
- `npm run format:check` — Prettierフォーマットチェック

## 地理データ管理

### ドキュメント
- `docs/geodata-management.md` — データソース、加工パイプライン、既知の問題パターン、修正手順の総合ガイド

### 専用エージェント
- `@geodata` — 地理データの調査・修正・検証を行う専用エージェント。路線・駅・河川・道路・POIのデータ品質問題に対して使用する

### 地理データ修正のルール
- データ修正は個別Issue単位で行い、PRは自動マージせずオーナーの確認を待つ
- 手動JSON編集より `scripts/` のスクリプト改善を優先する
- GeoJSON座標は小数点5桁精度に丸める（`scripts/optimize_geojson.py`）
- コミットメッセージは `data:` プレフィックスを使用する
- `public/data/` の同期を忘れないこと
