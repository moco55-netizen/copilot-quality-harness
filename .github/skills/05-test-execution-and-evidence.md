# Test Execution and Evidence

## Purpose
AIの自己申告ではなくCI実測値で結果を確定する。
## Trigger
実装とテストが揃ったとき。
## Required inputs
変更ブランチ、`test-design.json`、実行環境。
## Procedure
Unit、API、build、必要なE2Eを実行し、同一runIdの結果JSONと失敗証跡を保存する。
## Output contract
`qa/test-management/reports/test-result.json`、ログ、coverage、trace/screenshot（失敗時）。
## Stop conditions
テスト失敗、判定不能、未実施の隠蔽、health check失敗、coverage測定不能。
## Do not
失敗を成功に変換しない。
## Verification
コマンド、環境、件数、開始終了、再実行、失敗理由、Workflow URLを確認する。
