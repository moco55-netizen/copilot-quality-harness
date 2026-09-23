# Test Observation Design

## Purpose
テスト観点カタログから、実施・対象外・残存リスクを設計する。
## Trigger
解析結果が確定したとき。
## Required inputs
Issue契約、影響マトリクス、観点カタログ、過去障害。
## Procedure
必須観点ごとに目的、前提、期待結果、レベル、理由、優先度を記録する。
## Output contract
`test-design.md`と`test-design.json`。各観点に`id`, `status`, `reason`, `level`, `residualRisk`を含める。
## Stop conditions
必須観点の理由、完了基準、未実施理由がない。
## Do not
AI提案だけでリスクを確定しない。
## Verification
カタログ全項目と受入条件への対応を確認する。
