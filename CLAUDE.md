# ルール
このリポジトリでは以下のルールに従ってください。
* `--dangerously-skip-permissions` で起動するため、コマンドは基本的に自動許可されます。危険なコマンドは `.claude/hooks/deny-check.py` と `settings.json` の deny ルールでブロックされます。
* 作業を始めるときは、GitHub Issues でやるべきことを確認します（`gh issue list --no-assignee --state open`）。userから行うタスクが明言されていない場合は、`priority:critical` → `priority:high` の順に優先度の高いタスクから実行します。
* タスクを取得したら、以下の「マルチエージェント作業プロトコル」に従って作業を進めてください。
* evaluationの結果などにより課題が明確になったときは、GitHub Issueとして新しいタスクを作成してください（`gh issue create`）。
* 機能が1つできたら以下のGit運用ルールに従って、git hubにpushするようにしてください。
* 実装が終わったら、編集したファイルが属するディレクトリのREADMEを更新してください。
* 堅牢なプロジェクトの作成のためPythonでも型を明示するようにする決まりにしたり、linterやformatterを導入したりすることを推奨します。
* 作業中にsudoや.envの編集などuserの作業がなければそれ以上作業が進められない場合は、`needs:human` ラベル付きの GitHub Issue を作成して作業を中断してください（`gh issue create --label "needs:human"`）。
* プロジェクトの設計や提案などがあれば、同様に `needs:human` ラベル付きの GitHub Issue として作成してください。このとき、作業は中断する必要はありません。
* Claudeで自律的に作業させているとuserに技術的な知識がつかないので、新しく使用した言語やライブラリやツール、フレームワーク、モデルなどがある場合は `./docs/textbook/<topic>.md` に新規ファイルとしてわかりやすく技術紹介を作成してください。このとき、技術名、概要、導入した目的、メリット、実際にproject内でどのように使われているかの具体例について必ず記述するようにしてください。
* PRを出した後に、解決すべき課題や行うべき性能評価などのタスクがあればIssueを発行してください。

## マルチエージェント作業プロトコル

複数のClaude Codeエージェントや人間が同時に安全に作業できるよう、以下のプロトコルに従ってください。

### タスク取得手順

```bash
# 1. 未割当の優先タスクを検索
gh issue list --no-assignee --state open --label "priority:critical" --json number,title

# 2. タスクを取得（原子操作）
gh issue edit <NUMBER> --add-assignee "@me" --add-label "agent:claimed"

# 3. 確認（競合チェック）- 自分がassignされていることを確認
gh issue view <NUMBER> --json assignees

# 4. ブランチ作成
git checkout -b feature/<TASK-ID>-<description> main
```

### ブランチ命名規則
- `feature/<TASK-ID>-<description>` の形式を使用
- 例: `feature/ARCH-1-tabr-implementation`, `feature/KGE-1-knowledge-graph`

### ファイル編集ルール（コンフリクト防止）
- **技術ガイド**: `docs/textbook/<topic>.md` に新規ファイルとして作成（既存ファイルは必要な場合のみ編集）
- **他エージェントの作業確認**: `gh issue list --label "agent:claimed"` で作業中のモジュールを確認し、同じファイルの同時編集を避ける

### 作業完了手順

```bash
# 1. テスト通過を確認
uv run pytest tests/ -v

# 2. lint通過を確認
.venv/bin/ruff check .

# 3. commit & push（コミットメッセージに "Closes #<ISSUE-NUMBER>" を必ず含める）
git add <files>
git commit -m "feat: <TASK-ID> <description>

Closes #<ISSUE-NUMBER>"
git push -u origin feature/<TASK-ID>-<description>

# 4. PRはCIが自動作成・マージする（auto-pr-merge.yml）
#    ブランチ名のタスクIDから対応Issueを自動検索し、PRボディに "Closes #XX" を含める
#    さらに close-issues-on-merge.yml がマージ時にIssueを確実にクローズする

# 5. タスクのラベルを更新
gh issue edit <NUMBER> --remove-label "agent:claimed" --add-label "status:in-review"
```

## Git運用ルール
### ブランチ戦略
- 作業は必ず feature/xxx ブランチで行う
- 作業内容が変わったらブランチの名称を必ず変更する
- mainへの直接pushは禁止
### commitのルール
- 機能単位で実装が完了したらpush
- テストが通った状態でのみcommit
- 作業セッションの終了前に必ずpush
- databaseのような重くてgithubにpushすべきでないファイルや個人情報を含むためpushすべきでないファイルがある場合は.gitignoreに適宜追加してください。
### コミットメッセージ形式
- feat: 新機能追加
- fix: バグ修正
- data: データ収集・更新
- model: モデル学習・改善
- report: HTML結果レポート更新
- infra: CI/CD, 設定, インフラ変更
### pushのルール
- セッション終了時は必ずpushする
- pushのメッセージは行ったタスクのログの役割も担うため、行った実験のや課題など詳細に記述してください
- push後はCIやlintが通ったこと、conflictが発生していないことを確認してください。
