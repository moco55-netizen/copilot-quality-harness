# M5 fortnightly retrospective

M5 is a deterministic, local CLI over existing M3 `test-result.json` evidence. It does not call GitHub APIs, collect artifacts, use an AI provider, or write to GitHub.

## Collecting source reports

The Quality workflow uploads `quality-evidence-<run-id>-<attempt>` artifacts with a 14-day retention period. An owner must download the artifacts and retain or supply the extracted `test-result.json` files for the retrospective window. Artifact download/source collection is manual; the repository does not configure a scheduled run, API collection, or longer retention. Reports older than artifact retention cannot be recovered by this tool.

Supply one or more report files or directories containing `test-result.json` files, and an explicit 14-day UTC interval. The start is inclusive and the end is exclusive:

```bash
npm run m5:retrospective -- \
  --input ./downloaded-quality-artifacts \
  --start 2026-09-01T00:00:00Z \
  --end 2026-09-15T00:00:00Z \
  --output-dir ./qa/test-management/retrospectives
```

Repeat `--input` for multiple paths. File inputs are read as M3 reports; directory inputs are searched recursively for files named `test-result.json`. The report timestamp is `workflow.startedAt` when present, otherwise the observed `generatedAt`. Every report is validated before filtering. Reports at the end boundary or outside the selected interval are listed as excluded. No matching reports, invalid windows, malformed reports, unreadable inputs, and output-write errors stop generation with a nonzero exit code:

| Exit code | Meaning |
| ---: | --- |
| 0 | Retrospective written |
| 2 | Invalid arguments/window or malformed report |
| 3 | No report files found or no reports within the window |
| 4 | Input/output I/O failure |

Output is `retrospective.json` plus `retrospective.md`; the JSON contract is `qa/test-management/schemas/retrospective.schema.json`. Input is capped at 500 reports per invocation. No output is written if input validation or window selection fails.

## Evidence boundaries

The output preserves source paths, run IDs, observed timestamps, attempt values when present, report outcomes, exact step failures, and backend/frontend coverage observations. It counts source report records rather than asserting unique workflow runs. Coverage averages/minima/maxima are computed only from measured source values; missing coverage remains unavailable with its source reason.

M3 reports do not provide PR conversion, complete retry counts, false-positive adjudication, human decisions/adoption, issue outcomes, or a comparable trend baseline. These metrics remain explicitly unavailable; the retrospective does not infer them. No PR/issue lookup, retry attribution, or trend comparison is performed.

Any generated recommendation is `proposed`, includes its observed failure evidence, hypothesis, and verification method, and cannot be accepted by the CLI. A human must provide an owner and deadline before acceptance. This tool never modifies workflows, thresholds, or source reports and never treats an AI proposal as a human decision.

Run `npm run test:m5` for the deterministic M5 tests. The main Quality workflow runs this command and records its outcome in the M3 quality evidence report.
