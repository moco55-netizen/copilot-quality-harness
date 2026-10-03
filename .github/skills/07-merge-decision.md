# Merge Decision

## Purpose
品質条件未達の PR を安全に停止し、人間の最終判定を明確化する。

## Trigger
必須 CI、AI レビュー、人間レビューが揃ったとき。マージは自動で行わず、手動マージ前提とする。

## Required inputs
- Status Check
- CI 実行結果
- AI レビュー結果
- 人間承認
- 最新コミットと base の整合性
- リスク判定

## Procedure
1. 必須チェックを評価する。
2. 未達項目を抽出する。
3. 停止理由と修正案を PR コメントに出力する。
4. すべての条件が満たされたと判断した人間が、手動でマージする。

## Output contract
- 停止理由コメント
- 対応手順
- 人手マージ判断の履歴
- 自動マージの実行は行わない

## Stop conditions
- CI / AI レビュー / 人間承認の不足
- 差分更新
- Draft
- 高リスク変更
- 権限・fork 問題
- テスト失敗
- 重大な merge conflict

## Do not
- Branch protection を迂回しない
- AI 承認を人間承認に数えない
- Workflow から `gh pr merge --auto` を実行しない

## Verification
- 必須チェックと停止条件を機械的に確認する
- 最新コミット整合性を確認する
- 手動マージ前提で運用不能な条件がないかを検証する
