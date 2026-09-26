# M2 and M4 plan-to-delivery status

This note compares the [implementation plan](../plan.md) with the delivered [M2 intake workflow](../.github/workflows/m2-issue-intake.yml) and its [README instructions](../README.md#manual-github-actions-intake), plus the [M4 PR safety gate](m4-pr-safety-gate.md).

## M2: read-only intake delivered; implementation handoff deferred

The plan's M2 scope includes issue-number branch creation and Issue/branch/PR linkage, followed by Copilot implementation and test generation. The delivered M2 workflow is a deliberate read-only subset: it is manually dispatched from the default branch, validates and analyzes a same-repository issue, designs tests, posts a human-review comment, and uploads a report. It has `contents: read` and `issues: write`; it does not create a branch or PR, change source files, run implementation tests, or dispatch Copilot. `handoff.suggestedBranch` is only a proposed name, not a created branch. Therefore M2 is **not fully complete against the plan**.

The implementation handoff is deferred, not silently treated as complete. The workflow has no branch-write permission or branch-creation step, and this repository has no configured, trusted Copilot agent/task dispatch integration or authorized dispatch credential. Granting `contents: write` alone would not provide a safe or defined way to dispatch an agent. No GitHub API/integration, write permission, secret, or automation is added here.

Before implementation can be added, a repository owner must choose and authorize a supported agent dispatch/API integration and its credential model, approve the least-privilege branch-write mechanism, and define safeguards for human approval, allowed paths, diff limits, and Issue/branch/PR traceability. Until then, keep the current read-only handoff.

## M4: executable consumer contract; AI review execution is external

The M4 gate is executable: it gathers live GitHub signals and checks for an `AI Review` Check Run from the configured `AI_REVIEW_APP_ID`, bound to the current head SHA, successful, and carrying the required JSON status and risk. This makes a provider result checkable; the workflow does **not** run, host, or generate the AI review itself.

No AI provider is configured in this repository, so the gate reports AI review as `unavailable` and stops. Actual review execution remains an external provider/owner setup responsibility. The provider must be separately configured to publish the documented Check Run contract; no provider or secret is installed by this follow-up. See [M4 gate behavior and owner setup](m4-pr-safety-gate.md).
