# Implementation and Test

## Purpose
許可範囲内でコードと対応テストを変更する。
## Trigger
確定したIssue契約、解析、テスト設計があるとき。
## Required inputs
`issue-contract.json`、`repository-analysis.md`、`impact-matrix.json`、`test-design.json`。
## Procedure
実装、Unit/API、必要なPlaywrightを分離して作成し、差分と変更一覧を記録する。
## Output contract
コード、テスト、変更サマリ、変更ファイル一覧。
## Stop conditions
許可パス外、差分上限超過、高リスクDB/認証変更、設計との不一致。
## Do not
テスト省略を成功扱いにしない。無関係なリファクタリングをしない。
## Verification
diff check、対象テスト、build、依存差分、秘密情報検出。
