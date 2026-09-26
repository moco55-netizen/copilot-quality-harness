# M4 PR safety gate

The `PR safety gate` workflow gathers the current pull request, review, commit status, check-run, and base-branch protection signals from GitHub's read APIs. It writes `pr-safety-gate-input.json` and a deterministic `pr-safety-gate.json` report to a 14-day Actions artifact and the decision to the workflow summary. It never comments on a PR, enables auto-merge, or merges. `npm test` runs the deterministic M4 contract tests in the existing Quality workflow.

The gate stops unless the input snapshot is no more than 10 minutes old; the PR is open, non-Draft, and from the same repository; all signals match the event's current head SHA; every protected required check succeeds; branch protection requires up-to-date branches and at least one approval; a current human account approved the exact head; a trusted AI review check succeeds; the AI risk is low or medium; and all required read data is available. Forks, inaccessible protection, missing checks, missing permissions, malformed AI results, and unsupported states are explicit blockers with manual handoff instructions.

## AI review provider interface

No AI review provider is configured by this repository. Until one is configured, the report must say `AI review: unavailable` and stop; ordinary Actions checks, human reviews, or repository files must not be represented as an AI review.

A future provider must publish a GitHub Check Run on the current commit named exactly `AI Review`. Configure the repository variable `AI_REVIEW_APP_ID` with that provider's GitHub App ID. The check run must be issued by that App, finish with conclusion `success`, and have `output.summary` containing plain JSON in this shape:

```json
{
  "schemaVersion": 1,
  "status": "passed",
  "headSha": "<exact commit SHA reviewed>",
  "riskLevel": "low"
}
```

`riskLevel` is one of `low`, `medium`, `high`, or `critical`; high and critical always stop. The check run's actual `head_sha` and App ID are independently verified. A provider must review the PR diff, acceptance criteria, test design, observation catalog, and residual risks; a generic successful check is not sufficient. No provider token or `COPILOT_GITHUB_TOKEN` is used by this workflow.

## Owner setup and limitations

The repository currently has no branch protection or configured AI provider (`AI_REVIEW_APP_ID`), and this workflow deliberately has no secret-bearing or write-capable token. Its normal `GITHUB_TOKEN` reads pull requests, reviews, checks, and statuses, but is not configured to read branch protection. Therefore the safety-gate job is expected to report `stop` and fail its check until owner setup is completed; the M4 contract tests and Quality job remain independently testable. The report explicitly stops; it does not infer that protection or AI review exists. Do not add an administration-capable secret to this PR-triggered workflow. If protection read access is needed, a repository owner must first provide a trusted read-only integration that can safely supply the live protection response without exposing credentials to pull request code.

Before considering any later automation, a repository owner must configure protection/rulesets on the target branch: require the `Quality / quality` check, require the branch to be up to date, require at least one human approval, and dismiss stale approvals or otherwise ensure approvals are tied to the current head. Do not make `PR safety gate / decision` a required check: the gate itself reads the required signals and must not become a self-dependency. Pin the required check providers where GitHub supports it. Configure and verify the AI provider separately. Re-run the gate after setup and inspect its artifact and summary. This M4 implementation never changes these repository settings or turns on auto-merge.

The eligible state is only `eligible-for-human-handoff`; it is not permission to merge. Keep branch protection and human review as the final authority.

## Local contract tests

Run `npm run test:m4`. The tests use synthetic GitHub API snapshots to cover current-head binding, required checks, human-versus-AI review, risk, protection, permissions, and fail-closed handling.
