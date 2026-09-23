# Merge Decision

## Purpose
品質条件未達のPRを安全に停止する。
## Trigger
必須CI、AIレビュー、人間レビューが揃ったとき。
## Required inputs
Status Check、CI、AIレビュー、人間承認、最新コミット、リスク判定。
## Procedure
全条件を評価し、未達なら停止理由と手動対応を出力する。
## Output contract
Auto-merge設定、または停止理由コメント。現段階では設定操作を行わない。
## Stop conditions
CI/AIレビュー/人間承認のいずれか不足、差分更新、Draft、高リスク、権限・fork問題。
## Do not
Branch protectionを迂回しない。AI承認を人間承認に数えない。
## Verification
最新コミット一致と全条件を機械的に確認する。
