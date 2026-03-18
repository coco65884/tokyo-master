#!/usr/bin/env python3
"""PreToolUse hook: 危険なコマンドパターンを動的に検出してブロックする。

--dangerously-skip-permissions 環境下での安全弁として機能する。
settings.json の静的 deny ルールでカバーしきれない
複雑なパターン（フラグ位置の揺れ、パス展開等）を正規表現で検査する。
"""

import json
import re
import sys


def deny(reason: str) -> None:
    """deny判定を出力して終了する。"""
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason,
                }
            }
        )
    )
    sys.exit(0)


def check_bash_command(command: str) -> None:
    """Bashコマンドに対する動的denyチェック。"""

    # =============================================
    # 1. コマンドインジェクション防止
    # =============================================
    if re.search(r"(?<!\w)(eval|exec)\s", command):
        deny("eval/exec は安全上の理由でブロックされています")

    # =============================================
    # 2. 破壊的 rm 操作
    # =============================================
    # 2a. 広範なパスへの rm -rf
    #     rm -rf / , rm -rf ~ , rm -rf $HOME , rm -rf ..
    if re.search(
        r"rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|--recursive)\s+"
        r"(/\s|/$|/\b|~|\.\.|\$HOME)",
        command,
    ):
        deny("広範なディレクトリに対する rm -rf はブロックされています")

    # 2b. プロジェクト重要ディレクトリの削除保護
    PROTECTED_DIRS = [
        "backend",
        "frontend",
        "docs",
        "doc",
        "config",
        "docker",
        "evaluation",
        "tests",
        "scripts",
        "resources",
        r"\.git",
        r"\.claude",
        "models",
        "data",
        "audio_files",
    ]
    protected_pattern = "|".join(PROTECTED_DIRS)
    if re.search(
        rf"rm\s+(-[a-zA-Z]*r|-[a-zA-Z]*f|--recursive|--force).*\s+({protected_pattern})(/|\s|$)",
        command,
    ):
        deny(
            "プロジェクトの重要ディレクトリの削除はブロックされています。"
            "本当に削除が必要な場合は手動で実行してください"
        )

    # =============================================
    # 3. 破壊的 Git 操作（フラグ位置を問わず検出）
    # =============================================
    # git push --force / -f（位置を問わず）
    if re.search(r"git\s+push\b.*(\s--force\b|\s-[a-zA-Z]*f)", command):
        deny("git push --force はブロックされています")

    # git reset --hard
    if re.search(r"git\s+reset\b.*--hard", command):
        deny("git reset --hard はブロックされています")

    # git clean -f
    if re.search(r"git\s+clean\b.*-[a-zA-Z]*f", command):
        deny("git clean -f はブロックされています")

    # git checkout -- . (全ファイル復元)
    if re.search(r"git\s+checkout\s+--\s+\.", command):
        deny("git checkout -- . はブロックされています")

    # git rebase (履歴改変)
    if re.search(r"git\s+rebase\b", command):
        deny("git rebase は履歴改変のリスクがあるためブロックされています")

    # git filter-branch / git filter-repo (履歴書き換え)
    if re.search(r"git\s+filter-(branch|repo)\b", command):
        deny("git filter-branch/filter-repo はブロックされています")

    # git reflog expire / git gc --prune (履歴消去)
    if re.search(r"git\s+(reflog\s+expire|gc\s+--prune)", command):
        deny("git reflog expire / gc --prune はブロックされています")

    # =============================================
    # 4. curl: localhost/127.0.0.1 のみ許可
    # =============================================
    if re.search(r"(?<!\w)curl\s", command):
        # localhost / 127.0.0.1 / [::1] へのアクセスは許可
        if re.search(
            r"curl\s.*(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)",
            command,
        ):
            pass  # 許可
        else:
            deny(
                "curl は localhost 以外へのアクセスがブロックされています。"
                "外部URLへのアクセスには WebFetch を使用してください"
            )

    # =============================================
    # 5. ディスク・デバイス操作
    # =============================================
    if re.search(r"(mkfs|fdisk|parted)\b", command):
        deny("ディスクデバイスへの直接操作はブロックされています")

    if re.search(r"\bdd\b.*\b(of|if)=/dev/", command):
        deny("dd によるデバイス操作はブロックされています")

    # =============================================
    # 6. crontab 変更
    # =============================================
    if re.search(r"crontab\s+-[er]", command):
        deny("crontab の変更はブロックされています")

    # =============================================
    # 7. systemd / サービス操作
    # =============================================
    if re.search(
        r"systemctl\s+(start|stop|restart|enable|disable|mask|unmask)\b",
        command,
    ):
        deny("systemctl によるサービス操作はブロックされています")

    # =============================================
    # 8. ファイアウォール変更
    # =============================================
    if re.search(r"(iptables|ip6tables|ufw|firewall-cmd)\b", command):
        deny("ファイアウォール設定の変更はブロックされています")

    # =============================================
    # 9. 危険な環境変数
    # =============================================
    if re.search(r"LD_PRELOAD=", command):
        deny("LD_PRELOAD の設定はブロックされています")

    if re.search(r"LD_LIBRARY_PATH=", command):
        deny("LD_LIBRARY_PATH の設定はブロックされています")

    # =============================================
    # 10. プロセスの一括kill
    # =============================================
    if re.search(r"kill\s+-9\s+(-1|0)\b", command):
        deny("プロセスの一括 kill はブロックされています")

    if re.search(r"killall\b", command):
        deny("killall はブロックされています")


def main() -> None:
    try:
        input_data = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, EOFError):
        # パース失敗時は判定せずスキップ
        sys.exit(0)

    tool_name = input_data.get("tool_name", "")

    # Bash 以外のツールはこのhookでは判定しない
    # （ファイル系のdenyは settings.json の静的ルールで十分）
    if tool_name != "Bash":
        sys.exit(0)

    command = input_data.get("tool_input", {}).get("command", "")
    if not command:
        sys.exit(0)

    check_bash_command(command)

    # ブロック対象でなければ何も出力せず正常終了（= 許可）
    sys.exit(0)


if __name__ == "__main__":
    main()
