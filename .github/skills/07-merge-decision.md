# Merge Decision

## Purpose
品質条件未達のPRを安全に停止する。
## Trigger
必須CI、AIレビュー、人間レビューが揃ったとき。
## Required inputs
Status Check、CI、AIレビュー、人間承認、最新コミット、リスク判定。
## Procedure
現在のPR、head SHA、必須Status Check、Branch protection、人間レビュー、信頼済みAIレビュー結果を読み取り専用で取得し、全条件を評価する。未達・不明・古い信号があれば停止理由と手動対応を出力する。
## Output contract
`eligible-for-human-handoff`または`stop`の決定JSON、停止理由、Workflow Summary、Artifact、手動対応。Auto-mergeは常に無効のままにする。
## Stop conditions
CI/AIレビュー/人間承認のいずれか不足、差分更新、Draft、高リスク、権限・fork問題。
## Do not
Branch protectionを迂回しない。AI承認を人間承認として数えない。Auto-mergeを有効化しない。Branch protection/権限/信号が読めない場合に推測で許可しない。
## Verification
現在のhead SHAとの一致、人間承認とAIレビューの分離、すべての必須Check成功、保護設定、停止理由を機械的に確認する。
