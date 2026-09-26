import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const COVERAGE_SCOPES = [
  { id: 'backend', path: 'backend/coverage/coverage-summary.json' },
  { id: 'frontend', path: 'frontend/coverage/coverage-summary.json' }
];

const STEP_DEFINITIONS = [
  { id: 'install', environment: 'QUALITY_INSTALL', command: 'npm install' },
  { id: 'reportTests', environment: 'QUALITY_REPORT_TESTS', command: 'npm run test:report' },
  { id: 'unit', environment: 'QUALITY_UNIT', command: 'npm test' },
  { id: 'm5Tests', environment: 'QUALITY_M5_TESTS', command: 'npm run test:m5' },
  { id: 'm2Tests', environment: 'QUALITY_M2_TESTS', command: 'npm run test:m2' },
  { id: 'm2Validation', environment: 'QUALITY_M2_VALIDATION', command: 'npm run m2:validate' },
  { id: 'build', environment: 'QUALITY_BUILD', command: 'npm run build' },
  { id: 'lint', environment: 'QUALITY_LINT', command: 'npm run lint' },
  { id: 'playwrightInstall', environment: 'QUALITY_PLAYWRIGHT_INSTALL', command: 'npx playwright install --with-deps chromium' },
  { id: 'e2e', environment: 'QUALITY_E2E', command: 'npm run test:e2e' }
];

const ALLOWED_OUTCOMES = new Set(['success', 'failure', 'cancelled', 'skipped']);
const COVERAGE_THRESHOLD = 10;
const COVERAGE_METRICS = ['statements', 'branches', 'functions', 'lines'];

function stepOutcome(value) {
  if (!value) return 'not-run';
  if (!ALLOWED_OUTCOMES.has(value)) throw new Error(`Invalid workflow outcome: ${value}`);
  return value;
}

async function readCoverage(root, scope) {
  const reportPath = join(root, scope.path);
  let summary;
  try {
    summary = JSON.parse(await readFile(reportPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        status: 'not-measured',
        path: scope.path,
        thresholdPercent: COVERAGE_THRESHOLD,
        metrics: null,
        reason: 'The test runner did not produce a coverage summary.'
      };
    }
    throw error;
  }

  if (!summary.total || typeof summary.total !== 'object') {
    throw new Error(`Coverage summary is missing a total section: ${scope.path}`);
  }

  const metrics = Object.fromEntries(COVERAGE_METRICS.map((metric) => {
    const value = summary.total[metric];
    if (!value || !Number.isFinite(value.covered) || !Number.isFinite(value.total) ||
      !Number.isFinite(value.pct) || value.covered < 0 || value.total < 0 ||
      value.pct < 0 || value.pct > 100) {
      throw new Error(`Coverage summary has invalid ${metric} values: ${scope.path}`);
    }
    return [metric, { covered: value.covered, total: value.total, percent: value.pct }];
  }));

  return {
    status: 'measured',
    path: scope.path,
    thresholdPercent: COVERAGE_THRESHOLD,
    metrics,
    reason: null
  };
}

function workflowDetails(env) {
  const runId = env.GITHUB_RUN_ID || null;
  const serverUrl = env.GITHUB_SERVER_URL;
  const repository = env.GITHUB_REPOSITORY;
  const attempt = env.GITHUB_RUN_ATTEMPT ? Number(env.GITHUB_RUN_ATTEMPT) : null;
  if (attempt !== null && (!Number.isInteger(attempt) || attempt < 1)) {
    throw new Error(`Invalid workflow run attempt: ${env.GITHUB_RUN_ATTEMPT}`);
  }

  return {
    runId: runId || 'local',
    workflow: {
      name: env.GITHUB_WORKFLOW || null,
      url: runId && serverUrl && repository ? `${serverUrl}/${repository}/actions/runs/${runId}` : null,
      attempt,
      branch: env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME || null,
      commit: env.GITHUB_SHA || null,
      startedAt: env.QUALITY_STARTED_AT || null
    }
  };
}

export async function createReport({ env = process.env, root = process.cwd(), generatedAt = new Date().toISOString() } = {}) {
  const { runId, workflow } = workflowDetails(env);
  const steps = Object.fromEntries(STEP_DEFINITIONS.map(({ id, environment, command }) => [
    id,
    { command, outcome: stepOutcome(env[environment]) }
  ]));
  const coverage = Object.fromEntries(await Promise.all(
    COVERAGE_SCOPES.map(async (scope) => [scope.id, await readCoverage(root, scope)])
  ));
  const executedInWorkflow = Boolean(env.GITHUB_RUN_ID);
  const pipelineOutcomes = Object.values(steps).map(({ outcome }) => outcome);
  const failures = pipelineOutcomes.flatMap((outcome, index) =>
    outcome === 'failure' || outcome === 'cancelled'
      ? [`${STEP_DEFINITIONS[index].id} step ${outcome}.`]
      : []
  );
  const unexecuted = pipelineOutcomes.flatMap((outcome, index) =>
    outcome === 'skipped' || outcome === 'not-run'
      ? [`${STEP_DEFINITIONS[index].id} (${outcome}).`]
      : []
  );

  if (executedInWorkflow && pipelineOutcomes.every((outcome) => outcome === 'success')) {
    for (const [scope, result] of Object.entries(coverage)) {
      if (result.status !== 'measured') {
        failures.push(`${scope} coverage was not measured.`);
        continue;
      }
      for (const [metric, value] of Object.entries(result.metrics)) {
        if (value.percent < COVERAGE_THRESHOLD) {
          failures.push(`${scope} ${metric} coverage ${value.percent}% is below the ${COVERAGE_THRESHOLD}% threshold.`);
        }
      }
    }
  }

  const allPipelineStepsSucceeded = pipelineOutcomes.every((outcome) => outcome === 'success');
  const status = failures.length > 0
    ? 'failed'
    : executedInWorkflow && allPipelineStepsSucceeded && Object.values(coverage).every(({ status: value }) => value === 'measured')
      ? 'passed'
      : 'not-run';
  const unmeasured = [
    { metric: 'test counts', reason: 'The configured test runners do not emit a machine-readable test-count report.' },
    { metric: 'retry counts', reason: 'The current workflow does not retry test steps.' },
    { metric: 'coverage change', reason: 'A comparable baseline is not configured.' }
  ];
  for (const [scope, result] of Object.entries(coverage)) {
    if (result.status !== 'measured') {
      unmeasured.push({ metric: `${scope} coverage`, reason: result.reason });
    }
  }

  return {
    schemaVersion: 2,
    runId,
    generatedAt,
    status,
    workflow,
    steps,
    coverage,
    failures,
    unexecuted,
    unmeasured,
    residualRisks: ['SQLite is local-only in this starter slice', 'Human review remains required']
  };
}

export function formatSummary(report) {
  const workflowLink = report.workflow.url
    ? `[${report.runId} attempt ${report.workflow.attempt}](${report.workflow.url})`
    : 'Local run (GitHub Actions metadata unavailable)';
  const stepRows = Object.entries(report.steps)
    .map(([name, value]) => `| ${name} | ${value.outcome} | \`${value.command}\` |`)
    .join('\n');
  const coverageRows = Object.entries(report.coverage).map(([name, value]) => {
    if (value.status !== 'measured') return `| ${name} | not measured | ${value.reason} |`;
    const values = COVERAGE_METRICS.map((metric) => `${metric}: ${value.metrics[metric].percent}%`).join(', ');
    return `| ${name} | measured | ${values}; minimum ${value.thresholdPercent}% per metric |`;
  }).join('\n');
  const failures = report.failures.length > 0 ? report.failures.map((failure) => `- ${failure}`).join('\n') : '- None';
  const unexecuted = report.unexecuted.length > 0 ? report.unexecuted.map((step) => `- ${step}`).join('\n') : '- None';
  const unmeasured = report.unmeasured.map(({ metric, reason }) => `- ${metric}: ${reason}`).join('\n');

  return [
    '## Quality evidence',
    '',
    `- **Outcome:** ${report.status}`,
    `- **Workflow:** ${workflowLink}`,
    `- **Commit:** ${report.workflow.commit || 'not available'}`,
    `- **Generated:** ${report.generatedAt}`,
    '',
    '| Step | Outcome | Command |',
    '| --- | --- | --- |',
    stepRows,
    '',
    '| Coverage scope | Status | Measurements |',
    '| --- | --- | --- |',
    coverageRows,
    '',
    '### Failures',
    failures,
    '',
    '### Not run',
    unexecuted,
    '',
    '### Unmeasured',
    unmeasured,
    ''
  ].join('\n');
}

export async function writeReport(report, { root = process.cwd(), env = process.env } = {}) {
  const outputPath = join(root, 'qa/test-management/reports/test-result.json');
  await mkdir(join(root, 'qa/test-management/reports'), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  if (env.GITHUB_STEP_SUMMARY) {
    await appendFile(env.GITHUB_STEP_SUMMARY, `${formatSummary(report)}\n`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const report = await createReport();
  await writeReport(report);
  console.log(`Wrote qa/test-management/reports/test-result.json (${report.status})`);
  if (report.status === 'failed') process.exitCode = 1;
}
