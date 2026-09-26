import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { evaluateMergeDecision, formatGateSummary } from './pr-safety-gate.mjs';

const repository = 'moco55-netizen/copilot-quality-harness';
const headSha = '0123456789abcdef0123456789abcdef01234567';
const appId = '12345';
const now = new Date('2026-09-26T10:00:00.000Z');

function validSnapshot(overrides = {}) {
  return {
    schemaVersion: 1,
    runId: '987654321',
    observedAt: '2026-09-26T09:59:00.000Z',
    repository,
    expectedHeadSha: headSha,
    permissions: {
      pullRequestsRead: true,
      reviewsRead: true,
      checksRead: true,
      statusesRead: true,
      protectionRead: true
    },
    pullRequest: {
      number: 42,
      state: 'open',
      draft: false,
      user: { login: 'pull-request-author' },
      head: { sha: headSha, repo: { full_name: repository } },
      base: { ref: 'main', repo: { full_name: repository } }
    },
    branchProtection: {
      required_status_checks: { strict: true, contexts: ['Quality / quality'] },
      required_pull_request_reviews: { required_approving_review_count: 1 }
    },
    checkRuns: [
      {
        id: 1,
        name: 'quality',
        head_sha: headSha,
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-09-26T09:50:00.000Z',
        check_suite: { workflow_name: 'Quality' }
      },
      {
        id: 2,
        name: 'AI Review',
        head_sha: headSha,
        app: { id: Number(appId) },
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-09-26T09:55:00.000Z',
        output: {
          summary: JSON.stringify({
            schemaVersion: 1,
            status: 'passed',
            headSha,
            riskLevel: 'low'
          })
        }
      }
    ],
    statuses: [],
    reviews: [{
      id: 10,
      state: 'APPROVED',
      commit_id: headSha,
      submitted_at: '2026-09-26T09:58:00.000Z',
      user: { login: 'maintainer', type: 'User' }
    }],
    ...overrides
  };
}

function evaluate(snapshot = validSnapshot(), options = {}) {
  return evaluateMergeDecision({
    snapshot,
    expectedRepository: options.expectedRepository ?? repository,
    expectedHeadSha: options.expectedHeadSha ?? headSha,
    expectedAiReviewAppId: options.expectedAiReviewAppId === undefined ? appId : options.expectedAiReviewAppId,
    now
  });
}

test('allows only a current fully-qualified result to reach human handoff, never auto-merges', () => {
  const result = evaluate();
  assert.equal(result.decision, 'eligible-for-human-handoff');
  assert.equal(result.autoMergeEnabled, false);
  assert.equal(result.aiReview.status, 'passed');
  assert.equal(result.conditions.requiredChecksSuccessful, true);
  assert.equal(result.conditions.humanApproval, true);
  assert.deepEqual(result.reasons, []);
});

test('stops for missing, stale, or unsupported live signal data', () => {
  const missing = evaluate(null);
  assert.equal(missing.decision, 'stop');
  assert.match(missing.reasons.join('\n'), /snapshot is missing or has an unsupported schema version/);

  const stale = evaluate(validSnapshot({ observedAt: '2026-09-26T09:40:00.000Z' }));
  assert.equal(stale.conditions.inputsCurrent, false);
  assert.match(stale.reasons.join('\n'), /older than 10 minutes/);

  const unsupported = evaluate(validSnapshot({ schemaVersion: 99 }));
  assert.equal(unsupported.decision, 'stop');
  assert.equal(unsupported.autoMergeEnabled, false);
});

test('stops for unavailable permissions or branch-protection data', () => {
  const noPermissions = evaluate(validSnapshot({
    permissions: { pullRequestsRead: true, reviewsRead: true, checksRead: true, statusesRead: true }
  }));
  assert.equal(noPermissions.conditions.permissionsAvailable, false);
  assert.match(noPermissions.reasons.join('\n'), /protectionRead/);

  const noProtection = evaluate(validSnapshot({ branchProtection: null }));
  assert.equal(noProtection.conditions.protectionConfigured, false);
  assert.match(noProtection.reasons.join('\n'), /Branch protection is missing or could not be read/);

  const unsafeProtection = evaluate(validSnapshot({
    branchProtection: {
      required_status_checks: { strict: false, contexts: [] },
      required_pull_request_reviews: { required_approving_review_count: 0 }
    }
  }));
  assert.equal(unsafeProtection.decision, 'stop');
  assert.match(unsafeProtection.reasons.join('\n'), /does not require branches to be up to date/);
  assert.match(unsafeProtection.reasons.join('\n'), /at least one human approval/);
});

test('rejects forks, closed pull requests, Drafts, and a changed head SHA', () => {
  const fork = validSnapshot();
  fork.pullRequest.head.repo.full_name = 'contributor/fork';
  assert.equal(evaluate(fork).conditions.sameRepository, false);

  const draft = validSnapshot();
  draft.pullRequest.draft = true;
  assert.equal(evaluate(draft).conditions.notDraft, false);

  const closed = validSnapshot();
  closed.pullRequest.state = 'closed';
  assert.equal(evaluate(closed).conditions.notDraft, false);

  const changed = evaluate(validSnapshot(), { expectedHeadSha: 'fedcba9876543210fedcba9876543210fedcba98' });
  assert.equal(changed.conditions.currentHead, false);
});

test('requires every required check to be present, current, and successful', () => {
  const failed = validSnapshot();
  failed.checkRuns[0].conclusion = 'failure';
  assert.equal(evaluate(failed).conditions.requiredChecksSuccessful, false);

  const skipped = validSnapshot();
  skipped.checkRuns[0].conclusion = 'skipped';
  assert.equal(evaluate(skipped).conditions.requiredChecksSuccessful, false);

  const stale = validSnapshot();
  stale.checkRuns[0].head_sha = 'fedcba9876543210fedcba9876543210fedcba98';
  assert.equal(evaluate(stale).conditions.requiredChecksSuccessful, false);

  const ambiguous = validSnapshot();
  ambiguous.checkRuns.push({
    ...ambiguous.checkRuns[0],
    id: 3,
    conclusion: 'failure',
    started_at: ambiguous.checkRuns[0].started_at
  });
  assert.equal(evaluate(ambiguous).conditions.requiredChecksSuccessful, false);

  const status = validSnapshot({
    branchProtection: {
      required_status_checks: { strict: true, contexts: ['legacy-status'] },
      required_pull_request_reviews: { required_approving_review_count: 1 }
    },
    statuses: [{
      context: 'legacy-status',
      sha: headSha,
      state: 'success',
      created_at: '2026-09-26T09:57:00.000Z'
    }]
  });
  assert.equal(evaluate(status).conditions.requiredChecksSuccessful, true);
});

test('requires a current human approval and never counts bot or stale approvals', () => {
  const botOnly = validSnapshot();
  botOnly.reviews = [{
    ...botOnly.reviews[0],
    user: { login: 'automation[bot]', type: 'Bot' }
  }];
  assert.equal(evaluate(botOnly).conditions.humanApproval, false);

  const authorApproval = validSnapshot();
  authorApproval.reviews[0].user.login = authorApproval.pullRequest.user.login;
  assert.equal(evaluate(authorApproval).conditions.humanApproval, false);

  const staleApproval = validSnapshot();
  staleApproval.reviews[0].commit_id = 'fedcba9876543210fedcba9876543210fedcba98';
  assert.equal(evaluate(staleApproval).conditions.humanApproval, false);

  const latestChangesRequested = validSnapshot();
  latestChangesRequested.reviews.push({
    ...latestChangesRequested.reviews[0],
    id: 11,
    state: 'CHANGES_REQUESTED',
    submitted_at: '2026-09-26T09:59:30.000Z'
  });
  assert.equal(evaluate(latestChangesRequested).conditions.humanApproval, false);

  const tiedReviews = validSnapshot();
  tiedReviews.reviews.push({
    ...tiedReviews.reviews[0],
    id: 12,
    state: 'CHANGES_REQUESTED'
  });
  assert.equal(evaluate(tiedReviews).conditions.humanApproval, false);
});

test('keeps an unconfigured, stale, failed, or malformed AI review unavailable and stopped', () => {
  const noProvider = evaluate(validSnapshot(), { expectedAiReviewAppId: null });
  assert.equal(noProvider.aiReview.status, 'unavailable');
  assert.match(noProvider.reasons.join('\n'), /No trusted AI review provider is configured/);

  const noCheck = validSnapshot();
  noCheck.checkRuns = noCheck.checkRuns.filter(({ name }) => name !== 'AI Review');
  assert.equal(evaluate(noCheck).aiReview.status, 'unavailable');

  const stale = validSnapshot();
  stale.checkRuns[1].head_sha = 'fedcba9876543210fedcba9876543210fedcba98';
  assert.match(evaluate(stale).reasons.join('\n'), /AI Review result is stale/);

  const ambiguous = validSnapshot();
  ambiguous.checkRuns.push({
    ...ambiguous.checkRuns[1],
    id: 3
  });
  assert.match(evaluate(ambiguous).reasons.join('\n'), /tied for latest/);

  const failed = validSnapshot();
  failed.checkRuns[1].conclusion = 'failure';
  assert.equal(evaluate(failed).aiReview.status, 'failed');

  const malformed = validSnapshot();
  malformed.checkRuns[1].output.summary = 'AI says approved';
  assert.equal(evaluate(malformed).aiReview.status, 'failed');

  const wrongProvider = validSnapshot();
  wrongProvider.checkRuns[1].app.id = 54321;
  assert.match(evaluate(wrongProvider).reasons.join('\n'), /none were issued by the configured provider/);
});

test('denies high and critical risk reported by the trusted AI review provider', () => {
  for (const riskLevel of ['high', 'critical']) {
    const snapshot = validSnapshot();
    snapshot.checkRuns[1].output.summary = JSON.stringify({
      schemaVersion: 1,
      status: 'passed',
      headSha,
      riskLevel
    });
    const result = evaluate(snapshot);
    assert.equal(result.conditions.aiReviewSuccessful, true);
    assert.equal(result.conditions.riskAcceptable, false);
    assert.equal(result.decision, 'stop');
    assert.match(result.reasons.join('\n'), new RegExp(`${riskLevel} risk`));
  }
});

test('emits a manual handoff summary without implying AI review or merge when blocked', async () => {
  const result = evaluate(validSnapshot(), { expectedAiReviewAppId: null });
  const summary = formatGateSummary(result);
  assert.match(summary, /Decision:\*\* stop/);
  assert.match(summary, /Auto-merge:\*\* disabled/);
  assert.match(summary, /AI review:\*\* unavailable/);
  assert.match(summary, /Manual handoff/);

  const schema = JSON.parse(await readFile(join(process.cwd(), 'qa/test-management/schemas/pr-safety-gate.schema.json'), 'utf8'));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schemaVersion.const, result.schemaVersion);
  assert.deepEqual(schema.properties.conditions.required, Object.keys(result.conditions));
});
