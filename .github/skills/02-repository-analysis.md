# Repository Analysis

## Purpose
実装前に構成、依存、関連コード、既存テストを記録する。
## Trigger
`issue-contract.json`のAI実行可否がtrueのとき。
## Required inputs
`issue-contract.json`、README、構造、Workflow、既存テスト。
## Procedure
候補ファイルと影響領域を調査し、`repository-analysis.md`と`impact-matrix.json`を作成する。
## Output contract
候補ファイル、Frontend/Backend/API/DB/Infra/Docs分類、依存、リスク、調査範囲を含む。
## Stop conditions
影響範囲や変更対象を説明できない、仕様と実装が矛盾する。
## Do not
調査なしにファイルを変更しない。
## Verification
参照パスの存在と分類の整合性を確認する。
