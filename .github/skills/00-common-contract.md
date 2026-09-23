# Common Skill Contract

## Purpose
AIがIssueから実装・テスト・報告を行う際の共通入出力と安全境界を固定する。承認やマージは対象外。

## Trigger
Issue/PRの品質作業、Workflow dispatch、または前段Skillの成果物を受け取ったとき。

## Required inputs
- Issue/PR番号と本文、受入条件、対象範囲、severity
- 対象ブランチと変更差分
- 前段Skillの成果物（存在する場合）
- 品質基準とテスト観点カタログ

## Procedure
1. 入力と対象パスを読み、欠落・高リスク・権限を確認する。
2. 判断理由と未実施理由を記録する。
3. 許可範囲だけを変更し、決定論的な検証を実行する。
4. 出力スキーマ、差分、秘密情報、テスト結果を確認する。

## Output contract
成果物はリポジトリ内の指定ファイルに保存し、`schemaVersion`、`runId`、実施/未実施、残存リスクを含める。

## Stop conditions
受入条件・対象範囲の不足、critical/high、認証・個人情報・決済・破壊的DB変更、許可パス外変更、テスト失敗、権限不足。

## Do not
推測で受入条件を補完しない。秘密情報を出力しない。テスト成功を捏造しない。人間承認なしにマージ・保護設定変更をしない。

## Verification
`git diff --check`、対象テスト、build、依存差分、スキーマ、許可パスを確認する。
