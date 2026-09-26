# M2 and M4 plan-to-delivery status

This note compares the [implementation plan](../plan.md) with the delivered [M2 intake workflow](../.github/workflows/m2-issue-intake.yml) and its [README instructions](../README.md#manual-github-actions-intake), plus the [M4 PR safety gate](m4-pr-safety-gate.md).

## M2: read-only intake delivered; implementation handoff deferred

The plan's M2 scope includes issue-number branch creation and Issue/branch/PR linkage, followed by Copilot implementation and test generation. The delivered M2 workflow is a deliberate read-only subset: it is manually dispatched from the default branch, validates and analyzes a same-repository issue, designs tests, posts a human-review comment, and uploads a report. It has `contents: read` and `issues: write`; it does not create a branch or PR, change source files, run implementation tests, or dispatch Copilot. `handoff.suggestedBranch` is only a proposed name, not a created branch. Therefore M2 is **not fully complete against the plan**.

The implementation handoff is deferred, not silently treated as complete. The workflow has no branch-write permission or branch-creation step, and no trusted Copilot agent/task dispatch integration is configured. The presence, value, and scopes of any `COPILOT_GITHUB_TOKEN` were not inspected; this note neither reads nor tests it. Copilot CLI authentication alone does not authorize a GitHub Actions job to create branches or write through the GitHub API. A future workflow would need an explicitly authorized job-level `GITHUB_TOKEN` with `contents: write` (if repository/organization Actions policy permits it), or a narrowly scoped GitHub App or PAT credential.

Even with write credentials, a safe pilot is deferred: placing repository-write credentials in the same process as an AI agent could let issue prompt injection exercise them. Owner actions before any implementation pilot:

- Verify whether `COPILOT_GITHUB_TOKEN` is configured as an Actions secret and its intended Copilot CLI scope. Do not disclose the secret; its presence, value, and scopes have not been inspected here.
- Choose job-level `GITHUB_TOKEN` `contents: write` if repository/organization Actions policy permits it, or a dedicated least-privilege GitHub App/PAT. The repository's default workflow-token permissions are read-only. The `main` branch protection check returned 404 (absent); no secret settings were inspected.
- Configure a trusted, isolated Copilot agent runner/dispatch and an explicit human-approval boundary, separate from any repository-write credential.
- Only then implement an opt-in, human-confirmed low/medium-risk pilot with least-privilege branch writes, allowed-path and diff limits, and Issue/branch/PR traceability. Keep high/critical risk and untrusted or unapproved inputs stopped.

Until these steps are complete, keep the current read-only handoff. No credential or automation is added here.

## M4: executable consumer contract; AI review execution is external

The M4 gate is executable: it gathers live GitHub signals and checks for an `AI Review` Check Run from the configured `AI_REVIEW_APP_ID`, bound to the current head SHA, successful, and carrying the required JSON status and risk. This makes a provider result checkable; the workflow does **not** run, host, or generate the AI review itself.

No AI provider is configured in this repository, so the gate reports AI review as `unavailable` and stops. Actual review execution remains an external provider/owner setup responsibility. The provider must be separately configured to publish the documented Check Run contract; no provider or secret is installed by this follow-up. See [M4 gate behavior and owner setup](m4-pr-safety-gate.md).
