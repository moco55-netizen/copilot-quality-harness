# Issue Intake and Triage

## Purpose
Issueを構造化し、AI実装へ進めるかを人間に引き渡す。
## Trigger
`needs-triage`ラベル、または手動triage。
## Required inputs
Issue本文、テンプレート項目、ラベル、Project状態。
## Procedure
1. 背景、目的、受入条件、範囲、severity、テスト要求を抽出する。
2. 高リスク・不足情報・重複を確認する。
3. `issue-contract.json`を生成し、AI実行可否を明示する。
## Output contract
`issue-contract.json`: `schemaVersion`, `issueNumber`, `acceptanceCriteria`, `scope`, `severity`, `aiExecutionAllowed`, `missingInformation`。
## Stop conditions
受入条件・期待動作・対象範囲不足、critical/high、認証・個人情報・決済・DB破壊的変更。
## Do not
不足情報を推測しない。Issueを勝手に確定しない。
## Verification
必須キー、許容severity、Issue番号、重複実行を確認する。
