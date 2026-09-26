import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SNAPSHOT_MAX_AGE_MS = 10 * 60 * 1000;
const REQUIRED_PERMISSIONS = [
  'pullRequestsRead',
  'reviewsRead',
  'checksRead',
  'statusesRead',
  'protectionRead'
];
const VALID_RISKS = new Set(['low', 'medium', 'high', 'critical']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function dateValue(value) {
  if (typeof value !== 'string') return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

function checkRunContexts(run) {
  if (typeof run.name !== 'string') return [];
  const contexts = [run.name];
  const workflowName = run.check_suite?.workflow_name ?? run.workflow_name;
  if (typeof workflowName === 'string' && workflowName.length > 0) {
    contexts.push(`${workflowName} / ${run.name}`);
  }
  return contexts;
}

function requiredChecks(protection) {
  const required = protection?.required_status_checks;
  if (!isObject(required)) return [];
  if (Array.isArray(required.checks) && required.checks.length > 0) {
    return required.checks
      .filter((check) => isObject(check) && typeof check.context === 'string')
      .map(({ context, app_id }) => ({ context, appId: app_id ?? null }));
  }
  if (Array.isArray(required.contexts)) {
    return required.contexts
      .filter((context) => typeof context === 'string')
      .map((context) => ({ context, appId: null }));
  }
  return [];
}

function currentCheckCandidates(snapshot, headSha, required) {
  const candidates = [];
  for (const run of snapshot.checkRuns) {
    if (!isObject(run) || run.head_sha !== headSha ||
      !checkRunContexts(run).includes(required.context)) continue;
    if (required.appId !== null && run.app?.id !== required.appId) continue;
    const timestamp = dateValue(run.started_at) ?? dateValue(run.created_at);
    candidates.push({
      timestamp,
      success: run.status === 'completed' && run.conclusion === 'success',
      source: 'check run'
    });
  }
  for (const status of snapshot.statuses) {
    if (!isObject(status) || status.sha !== headSha ||
      status.context !== required.context || required.appId !== null) continue;
    const timestamp = dateValue(status.updated_at) ?? dateValue(status.created_at);
    candidates.push({
      timestamp,
      success: status.state === 'success',
      source: 'commit status'
    });
  }
  return candidates;
}

function latestSuccessfulCandidate(candidates) {
  if (candidates.length === 0 || candidates.some(({ timestamp }) => timestamp === null)) return false;
  const latestTimestamp = Math.max(...candidates.map(({ timestamp }) => timestamp));
  return candidates
    .filter(({ timestamp }) => timestamp === latestTimestamp)
    .every(({ success }) => success);
}

function findHumanApproval(reviews, headSha, pullRequestAuthor) {
  const latestByReviewer = new Map();
  for (const review of reviews) {
    if (!isObject(review) || review.user?.type !== 'User' ||
      typeof review.user.login !== 'string' || typeof review.state !== 'string') continue;
    const timestamp = dateValue(review.submitted_at);
    if (timestamp === null) continue;
    const current = latestByReviewer.get(review.user.login);
    if (!current || timestamp > current.timestamp) {
      latestByReviewer.set(review.user.login, { reviews: [review], timestamp });
    } else if (timestamp === current.timestamp) {
      current.reviews.push(review);
    }
  }
  return [...latestByReviewer.entries()].some(([reviewer, { reviews: latestReviews }]) =>
    reviewer !== pullRequestAuthor && latestReviews.length === 1 && latestReviews[0].state === 'APPROVED' &&
    latestReviews[0].commit_id === headSha);
}

function readAiReview(snapshot, headSha, expectedAppId, reasons) {
  if (!expectedAppId) {
    reasons.push('No trusted AI review provider is configured; AI review is unavailable.');
    return { status: 'unavailable', riskLevel: null, checkRunId: null, appId: null };
  }

  const namedRuns = snapshot.checkRuns.filter((run) =>
    isObject(run) && run.name === 'AI Review');
  const providerRuns = namedRuns.filter((run) => String(run.app?.id ?? '') === expectedAppId);
  if (providerRuns.length === 0) {
    reasons.push('A current AI Review check from the configured provider was not found.');
    if (namedRuns.length > 0) {
      reasons.push('AI Review check runs were present, but none were issued by the configured provider.');
    }
    return { status: 'unavailable', riskLevel: null, checkRunId: null, appId: null };
  }

  const currentRuns = providerRuns.filter((run) => run.head_sha === headSha);
  if (currentRuns.length === 0) {
    reasons.push('The AI Review result is stale because it does not match the current pull request head.');
    return { status: 'unavailable', riskLevel: null, checkRunId: null, appId: expectedAppId };
  }

  const timestamps = currentRuns.map((run) => dateValue(run.started_at) ?? dateValue(run.created_at));
  if (timestamps.some((timestamp) => timestamp === null)) {
    reasons.push('The current AI Review check has a missing or invalid timestamp.');
    return { status: 'failed', riskLevel: null, checkRunId: null, appId: expectedAppId };
  }
  const latestTimestamp = Math.max(...timestamps);
  const latestRuns = currentRuns.filter((run) =>
    (dateValue(run.started_at) ?? dateValue(run.created_at)) === latestTimestamp);
  if (latestRuns.length !== 1) {
    reasons.push('Multiple current AI Review checks are tied for latest; the result is ambiguous.');
    return { status: 'failed', riskLevel: null, checkRunId: null, appId: expectedAppId };
  }
  const [latest] = latestRuns;
  if (latest.status !== 'completed' || latest.conclusion !== 'success') {
    reasons.push('The current AI Review check has not completed successfully.');
    return {
      status: 'failed',
      riskLevel: null,
      checkRunId: latest.id ?? null,
      appId: expectedAppId
    };
  }

  let result;
  try {
    result = JSON.parse(latest.output?.summary ?? '');
  } catch {
    reasons.push('The AI Review check summary is missing or is not valid JSON.');
    return {
      status: 'failed',
      riskLevel: null,
      checkRunId: latest.id ?? null,
      appId: expectedAppId
    };
  }

  if (!isObject(result) || result.schemaVersion !== 1 ||
    result.status !== 'passed' || result.headSha !== headSha ||
    !VALID_RISKS.has(result.riskLevel)) {
    reasons.push('The AI Review result does not match the required version, status, head SHA, and risk contract.');
    return {
      status: 'failed',
      riskLevel: VALID_RISKS.has(result?.riskLevel) ? result.riskLevel : null,
      checkRunId: latest.id ?? null,
      appId: expectedAppId
    };
  }

  if (result.riskLevel === 'high' || result.riskLevel === 'critical') {
    reasons.push(`The AI Review identified ${result.riskLevel} risk; human risk handling is required.`);
  }
  return {
    status: 'passed',
    riskLevel: result.riskLevel,
    checkRunId: latest.id ?? null,
    appId: expectedAppId
  };
}

export function evaluateMergeDecision({
  snapshot,
  expectedRepository,
  expectedHeadSha,
  expectedAiReviewAppId = null,
  now = new Date()
} = {}) {
  const reasons = [];
  const conditions = {
    inputsCurrent: false,
    permissionsAvailable: false,
    sameRepository: false,
    currentHead: false,
    notDraft: false,
    protectionConfigured: false,
    requiredChecksSuccessful: false,
    humanApproval: false,
    aiReviewSuccessful: false,
    riskAcceptable: false
  };

  const input = isObject(snapshot) ? snapshot : {};
  if (input.schemaVersion !== 1) reasons.push('The live signal snapshot is missing or has an unsupported schema version.');
  const observedAt = dateValue(input.observedAt);
  const nowValue = now instanceof Date ? now.getTime() : dateValue(now);
  conditions.inputsCurrent = observedAt !== null && nowValue !== null &&
    observedAt <= nowValue + 5 * 60 * 1000 && nowValue - observedAt <= SNAPSHOT_MAX_AGE_MS;
  if (!conditions.inputsCurrent) {
    reasons.push('The live signal snapshot is missing, invalid, or older than 10 minutes.');
  }

  const permissions = isObject(input.permissions) ? input.permissions : {};
  conditions.permissionsAvailable = REQUIRED_PERMISSIONS.every((permission) => permissions[permission] === true);
  if (!conditions.permissionsAvailable) {
    const missing = REQUIRED_PERMISSIONS.filter((permission) => permissions[permission] !== true);
    reasons.push(`Required read permissions or API data are unavailable: ${missing.join(', ')}.`);
  }

  const pullRequest = isObject(input.pullRequest) ? input.pullRequest : null;
  const baseRepository = pullRequest?.base?.repo?.full_name;
  const headRepository = pullRequest?.head?.repo?.full_name;
  conditions.sameRepository = Boolean(expectedRepository && input.repository === expectedRepository &&
    baseRepository === expectedRepository && headRepository === expectedRepository);
  if (!conditions.sameRepository) {
    reasons.push('The pull request is not from the trusted same-repository context.');
  }

  const currentHeadSha = pullRequest?.head?.sha;
  conditions.currentHead = Boolean(expectedHeadSha && input.expectedHeadSha === expectedHeadSha &&
    currentHeadSha === expectedHeadSha &&
    typeof currentHeadSha === 'string' && currentHeadSha.length > 0);
  if (!conditions.currentHead) {
    reasons.push('The pull request and collected snapshot heads do not match the current event head SHA.');
  }

  conditions.notDraft = pullRequest?.state === 'open' && pullRequest?.draft === false;
  if (!conditions.notDraft) reasons.push('The pull request is not open and ready for review (non-Draft).');

  const branchProtection = isObject(input.branchProtection) ? input.branchProtection : null;
  const required = requiredChecks(branchProtection);
  const approvalCount = branchProtection?.required_pull_request_reviews?.required_approving_review_count;
  conditions.protectionConfigured = Boolean(branchProtection &&
    branchProtection.required_status_checks?.strict === true &&
    required.length > 0 && Number.isInteger(approvalCount) && approvalCount >= 1);
  if (!branchProtection) {
    reasons.push('Branch protection is missing or could not be read; no merge eligibility can be established.');
  } else {
    if (branchProtection.required_status_checks?.strict !== true) {
      reasons.push('Branch protection does not require branches to be up to date.');
    }
    if (required.length === 0) reasons.push('Branch protection has no required status checks configured.');
    if (!Number.isInteger(approvalCount) || approvalCount < 1) {
      reasons.push('Branch protection does not require at least one human approval.');
    }
  }

  const checkRuns = Array.isArray(input.checkRuns) ? input.checkRuns : [];
  const statuses = Array.isArray(input.statuses) ? input.statuses : [];
  conditions.requiredChecksSuccessful = conditions.protectionConfigured && required.every((check) =>
    latestSuccessfulCandidate(currentCheckCandidates({ checkRuns, statuses }, currentHeadSha, check)));
  if (conditions.protectionConfigured && !conditions.requiredChecksSuccessful) {
    const failed = required.filter((check) =>
      !latestSuccessfulCandidate(currentCheckCandidates({ checkRuns, statuses }, currentHeadSha, check))
    ).map(({ context }) => context);
    reasons.push(`Required checks are missing, stale, pending, failed, or ambiguous: ${failed.join(', ')}.`);
  }

  const reviews = Array.isArray(input.reviews) ? input.reviews : [];
  conditions.humanApproval = conditions.protectionConfigured && conditions.currentHead &&
    findHumanApproval(reviews, currentHeadSha, pullRequest?.user?.login);
  if (conditions.protectionConfigured && !conditions.humanApproval) {
    reasons.push('A current human approval for the exact head SHA is missing; AI review is not a substitute.');
  }

  const aiReview = readAiReview(
    { checkRuns },
    currentHeadSha,
    typeof expectedAiReviewAppId === 'string' ? expectedAiReviewAppId : null,
    reasons
  );
  conditions.aiReviewSuccessful = aiReview.status === 'passed';
  conditions.riskAcceptable = aiReview.status === 'passed' &&
    aiReview.riskLevel !== 'high' && aiReview.riskLevel !== 'critical';

  if (aiReview.status === 'passed' && !conditions.riskAcceptable) {
    reasons.push('The change risk is not acceptable for automated merge eligibility.');
  } else if (aiReview.status !== 'passed') {
    reasons.push('Risk cannot be cleared without a valid current AI review result.');
  }

  const blockers = [...new Set(reasons)];
  const canHandOff = blockers.length === 0;
  return {
    schemaVersion: 1,
    runId: typeof input.runId === 'string' && input.runId.length > 0 ? input.runId : 'unavailable',
    generatedAt: now instanceof Date ? now.toISOString() : new Date(nowValue ?? Date.now()).toISOString(),
    repository: typeof input.repository === 'string' ? input.repository : null,
    pullRequestNumber: Number.isInteger(pullRequest?.number) ? pullRequest.number : null,
    expectedHeadSha: typeof expectedHeadSha === 'string' ? expectedHeadSha : null,
    observedAt: typeof input.observedAt === 'string' ? input.observedAt : null,
    decision: canHandOff ? 'eligible-for-human-handoff' : 'stop',
    autoMergeEnabled: false,
    aiReview,
    conditions,
    reasons: blockers,
    manualHandoff: [
      'This workflow never enables auto-merge or merges a pull request.',
      'Resolve every listed blocker and rerun the gate on the current head before a human makes any merge decision.',
      'A repository owner must verify required checks, one human approval, up-to-date branches, and protection settings.'
    ]
  };
}

export function formatGateSummary(report) {
  const reasons = report.reasons.length > 0
    ? report.reasons.map((reason) => `- ${reason}`).join('\n')
    : '- All configured signals match the current pull request head.';
  const conditionRows = Object.entries(report.conditions)
    .map(([condition, passed]) => `| ${condition} | ${passed ? 'pass' : 'stop'} |`)
    .join('\n');
  const handoff = report.manualHandoff.map((action) => `- ${action}`).join('\n');
  return [
    '## M4 PR safety gate',
    '',
    `- **Decision:** ${report.decision}`,
    '- **Auto-merge:** disabled (this workflow does not change merge settings)',
    `- **Pull request:** ${report.pullRequestNumber ?? 'unavailable'}`,
    `- **Head SHA:** ${report.expectedHeadSha ?? 'unavailable'}`,
    `- **AI review:** ${report.aiReview.status}${report.aiReview.riskLevel ? `; risk ${report.aiReview.riskLevel}` : ''}`,
    '',
    '| Condition | Result |',
    '| --- | --- |',
    conditionRows,
    '',
    '### Stop reasons',
    reasons,
    '',
    '### Manual handoff',
    handoff,
    ''
  ].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const inputIndex = args.indexOf('--input');
  const outputIndex = args.indexOf('--output');
  if (inputIndex < 0 || outputIndex < 0 || !args[inputIndex + 1] || !args[outputIndex + 1]) {
    throw new Error('Usage: node scripts/pr-safety-gate.mjs --input <snapshot.json> --output <report.json>');
  }

  const snapshot = JSON.parse(await readFile(args[inputIndex + 1], 'utf8'));
  const report = evaluateMergeDecision({
    snapshot,
    expectedRepository: process.env.GITHUB_REPOSITORY,
    expectedHeadSha: process.env.EXPECTED_HEAD_SHA,
    expectedAiReviewAppId: process.env.AI_REVIEW_APP_ID || null
  });
  const outputPath = resolve(args[outputIndex + 1]);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  const summary = formatGateSummary(report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  }
  console.log(summary);
  if (report.decision === 'stop') process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
