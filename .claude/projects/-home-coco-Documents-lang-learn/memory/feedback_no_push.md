---
name: feedback_no_push
description: Do not push to remote without explicit user approval
type: feedback
---

勝手にpushしないこと。問題が解決したことを確認するまでpushしてはいけない。

**Why:** 未検証の修正をpushしてしまい、問題が解決していなかった。ユーザーの確認なしにpushすると壊れたコードがリモートに上がる。

**How to apply:** git pushは必ずユーザーに確認してから実行する。特にfix系のブランチでは、ユーザーが動作確認を完了するまでpushしない。
