# PR Report and AI Review

## Purpose
PRに設計意図、結果、残存リスクを提示し、AIレビューを補助ゲートにする。
## Trigger
テスト結果が確定しDraft PRを作成するとき。
## Required inputs
Issue、差分、テスト設計、テスト結果、未実施項目。
## Procedure
現在のPR/Commit/Check Run/Review/Branch protection API信号を収集し、同じhead SHAに紐づく決定論的レポートとSummaryを生成する。AIレビューは設定済みの信頼済みProvider Check Runからだけ取得し、未設定・取得不能は`unavailable`として停止する。
## Output contract
PRレポート、AIレビュー状態、Summary、Artifact。同一runIdを使用する。AIレビューと人間の承認を別フィールドに記録する。
## Stop conditions
結果と本文の不一致、判定不能、残存リスク未記載、古い/不完全な信号、未設定Provider。
## Do not
AIレビューを人間承認として扱わない。
ProviderがないのにAIレビューを実行したと主張しない。WorkflowからPRコメントを書き込まない。
## Verification
Issue/PR紐付け、差分とテスト対象、head SHAとrunId一致を確認する。
