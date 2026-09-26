# Retrospective and Improvement

## Purpose
Separate observed quality evidence, AI-generated proposals, and human decisions. M5 produces a bounded, deterministic retrospective from existing M3 workflow reports; it does not decide or implement improvements.

## Trigger
Run manually for an explicit 14-day interval after an owner has downloaded the available Quality workflow artifacts. There is no scheduled retrospective or automatic artifact collection.

## Required inputs
One or more M3 `test-result.json` files, or directories containing them, plus an explicit start and exclusive end timestamp exactly 14 days apart. See [`../../docs/m5-fortnightly-retrospective.md`](../../docs/m5-fortnightly-retrospective.md) for manual artifact setup and CLI usage.

## Procedure
Run `npm run m5:retrospective -- --input <file-or-directory> --start <ISO-date-time> --end <ISO-date-time>`. The CLI validates every input, selects reports by observed `workflow.startedAt` (or the report's observed `generatedAt` if the workflow timestamp is unavailable), and emits JSON and Markdown. It reports counts of source report outcomes, actual failed steps, and only measured backend/frontend coverage.

## Output contract
`retrospective.json` conforms to `qa/test-management/schemas/retrospective.schema.json`; Markdown contains the same window, metrics, source run IDs/paths/timestamps, and excluded out-of-window reports. Recommendations are always `proposed` and include an evidence basis, hypothesis, and verification method. Human owner and deadline are required before any acceptance; this CLI leaves approval pending.

## Stop conditions
Invalid or malformed input, a window other than exactly 14 days, no discovered reports, or no reports within the selected window stops generation with a nonzero exit code. No partial retrospective is written.

## Do not
Do not infer missing values, PR conversion, complete retry counts, false positives, decisions/adoption, issue outcomes, or trend baselines. Do not treat proposals as accepted, and do not automatically change workflows or thresholds.

## Owner setup
Quality artifacts are retained for 14 days. Owners must manually download and retain the artifact reports needed for the selected interval; reports that are no longer available must be recorded as unavailable rather than reconstructed.

## Verification
Check the exact UTC window, included/excluded report paths, observed run IDs and timestamps, measured coverage observations, and proposal evidence. Run `npm run test:m5`; the main Quality CI workflow runs this test command.
