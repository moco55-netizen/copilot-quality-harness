# Retrospective and Improvement

## Purpose
AIと人間の判断を分離して品質改善へ反映する。
## Trigger
2週間単位、または十分なRunデータが蓄積したとき。
## Required inputs
Issue、PR、Workflow、Artifact、見逃し、不具合、停止理由。
## Procedure
実行数、PR化率、CI/E2E失敗率、coverage、再実行、採否、誤検知を集計する。
## Output contract
振り返りMarkdown、改善候補、採否理由、担当、期限、検証方法。
## Stop conditions
データ欠落、AI提案と人間判断の混同、担当・期限・検証方法の欠落。
## Do not
欠測値を推測で埋めない。
## Verification
集計元Run ID、期間、指標、改善仮説を確認する。
