import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createRetrospective, formatMarkdown } from './retrospective.mjs';

const start = '2026-01-01T00:00:00.000Z';
const end = '2026-01-15T00:00:00.000Z';
const generatedAt = '2026-02-01T12:00:00.000Z';
const metrics = Object.fromEntries(['statements', 'branches', 'functions', 'lines'].map((name) => [
  name,
  { covered: 8, total: 10, percent: 80 }
]));

function report({
  runId = 'run-1',
  startedAt = start,
  status = 'passed',
  stepOutcome = 'success',
  backend = { status: 'measured', path: 'backend/coverage/coverage-summary.json', thresholdPercent: 10, metrics, reason: null },
  frontend = { status: 'measured', path: 'frontend/coverage/coverage-summary.json', thresholdPercent: 10, metrics, reason: null },
  attempt = 1
} = {}) {
  return {
    schemaVersion: 2,
    runId,
    generatedAt,
    status,
    workflow: {
      name: 'Quality',
      url: null,
      attempt,
      branch: 'main',
      commit: 'abc123',
      startedAt
    },
    steps: {
      unit: { command: 'npm test', outcome: stepOutcome },
      e2e: { command: 'npm run test:e2e', outcome: 'success' }
    },
    coverage: { backend, frontend },
    failures: [],
    unexecuted: [],
    unmeasured: [],
    residualRisks: []
  };
}

async function saveReport(directory, name, value) {
  const path = join(directory, name, 'test-result.json');
  await mkdir(join(directory, name), { recursive: true });
  await writeFile(path, JSON.stringify(value));
  return path;
}

test('aggregates only in-window source reports, preserving IDs, timestamps, failures, and measured coverage', async () => {
  const root = await mkdtemp(join(tmpdir(), 'm5-retrospective-'));
  try {
    const passedPath = await saveReport(root, 'run-passed', report({
      runId: '101',
      startedAt: start,
      attempt: 2
    }));
    const failedPath = await saveReport(root, 'run-failed', report({
      runId: '102',
      startedAt: '2026-01-14T23:59:59.000Z',
      status: 'failed',
      stepOutcome: 'failure',
      backend: {
        status: 'measured',
        path: 'backend/coverage/coverage-summary.json',
        thresholdPercent: 10,
        metrics: Object.fromEntries(Object.entries(metrics).map(([name, value]) => [
          name, { ...value, covered: 5, percent: 50 }
        ])),
        reason: null
      },
      frontend: {
        status: 'not-measured',
        path: 'frontend/coverage/coverage-summary.json',
        thresholdPercent: 10,
        metrics: null,
        reason: 'Frontend tests did not produce coverage.'
      }
    }));
    const excludedPath = await saveReport(root, 'run-at-end', report({
      runId: '103',
      startedAt: end
    }));
    await saveReport(root, 'run-not-run', report({
      runId: '104',
      startedAt: '2026-01-07T12:00:00.000Z',
      status: 'not-run',
      stepOutcome: 'skipped',
      backend: {
        status: 'not-measured',
        path: 'backend/coverage/coverage-summary.json',
        thresholdPercent: 10,
        metrics: null,
        reason: 'Backend tests did not produce coverage.'
      }
    }));

    const retrospective = await createRetrospective({
      inputs: [root],
      start,
      end,
      generatedAt,
      cwd: root
    });

    assert.deepEqual(retrospective.window, { start, end, endExclusive: true, days: 14 });
    assert.deepEqual(retrospective.metrics.reports, { total: 3, passed: 1, failed: 1, notRun: 1 });
    assert.deepEqual(retrospective.source.reports.map(({ runId }) => runId).sort(), ['101', '102', '104']);
    assert.ok(retrospective.source.reports.some(({ path }) => path === 'run-passed/test-result.json'));
    assert.ok(retrospective.source.outOfWindowReports.some(({ path }) => path === 'run-at-end/test-result.json'));
    assert.equal(retrospective.metrics.coverage.backend.summary.statements.meanPercent, 65);
    assert.equal(retrospective.metrics.coverage.backend.summary.statements.observations, 2);
    assert.equal(retrospective.metrics.coverage.backend.unavailableReports.length, 1);
    assert.equal(retrospective.metrics.coverage.frontend.summary.lines.meanPercent, 80);
    assert.equal(retrospective.metrics.coverage.frontend.unavailableReports[0].reason, 'Frontend tests did not produce coverage.');
    assert.deepEqual(retrospective.metrics.stepFailures, [{
      step: 'unit',
      count: 1,
      evidence: [{ path: 'run-failed/test-result.json', runId: '102' }]
    }]);
    assert.equal(retrospective.recommendations.length, 1);
    assert.equal(retrospective.recommendations[0].status, 'proposed');
    assert.deepEqual(retrospective.recommendations[0].humanApproval, {
      status: 'required',
      owner: null,
      deadline: null
    });
    assert.match(retrospective.recommendations[0].hypothesis, /hypothesis|may identify/i);
    assert.match(retrospective.recommendations[0].verificationMethod, /verify/i);

    const markdown = formatMarkdown(retrospective);
    assert.match(markdown, /start inclusive \/ end exclusive/);
    assert.match(markdown, /proposal only; human approval required/);
    assert.match(markdown, /Owner \/ deadline/);
    assert.match(markdown, /false positives:.*unavailable/);
    assert.match(markdown, /no artifact API/i);
    assert.ok(passedPath);
    assert.ok(failedPath);
    assert.ok(excludedPath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('uses the observed generatedAt when a report has no workflow start timestamp', async () => {
  const root = await mkdtemp(join(tmpdir(), 'm5-retrospective-'));
  try {
    await saveReport(root, 'generated-time', report({
      runId: 'local-observed',
      startedAt: null
    }));
    const result = await createRetrospective({
      inputs: [root],
      start: '2026-02-01T00:00:00.000Z',
      end: '2026-02-15T00:00:00.000Z',
      generatedAt,
      cwd: root
    });
    assert.equal(result.source.reports[0].timestampField, 'generatedAt');
    assert.equal(result.source.reports[0].observedAt, generatedAt);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('stops with a clear out-of-window reason and requires exactly fourteen days', async () => {
  const root = await mkdtemp(join(tmpdir(), 'm5-retrospective-'));
  try {
    await saveReport(root, 'outside', report({ runId: 'outside-run', startedAt: end }));
    await assert.rejects(
      createRetrospective({ inputs: [root], start, end, cwd: root }),
      (error) => error.exitCode === 3 && /No suitable reports/.test(error.message) && /outside-run/.test(error.message)
    );
    await assert.rejects(
      createRetrospective({ inputs: [root], start, end: '2026-01-14T00:00:00.000Z', cwd: root }),
      /exactly 14 days/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects malformed JSON and malformed M3 reports instead of producing a retrospective', async () => {
  const root = await mkdtemp(join(tmpdir(), 'm5-retrospective-'));
  try {
    const malformedPath = join(root, 'bad.json');
    await writeFile(malformedPath, '{');
    await assert.rejects(
      createRetrospective({ inputs: [malformedPath], start, end, cwd: root }),
      (error) => error.exitCode === 2 && /invalid JSON/.test(error.message)
    );
    await writeFile(malformedPath, JSON.stringify({ ...report(), coverage: { backend: {}, frontend: {} } }));
    await assert.rejects(
      createRetrospective({ inputs: [malformedPath], start, end, cwd: root }),
      (error) => error.exitCode === 2 && /backend coverage/.test(error.message)
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('stops when no reports are found and writes both output formats through the CLI', async () => {
  const root = await mkdtemp(join(tmpdir(), 'm5-retrospective-'));
  try {
    const empty = join(root, 'empty');
    await mkdir(empty);
    await assert.rejects(
      createRetrospective({ inputs: [empty], start, end, cwd: root }),
      (error) => error.exitCode === 3 && /No test-result.json reports/.test(error.message)
    );

    const input = await saveReport(root, 'run', report({ runId: 'cli-run' }));
    const output = join(root, 'generated');
    const script = join(process.cwd(), 'scripts', 'retrospective.mjs');
    const result = spawnSync(process.execPath, [
      script,
      '--input', input,
      '--start', start,
      '--end', end,
      '--output-dir', output
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const json = JSON.parse(await readFile(join(output, 'retrospective.json'), 'utf8'));
    const markdown = await readFile(join(output, 'retrospective.md'), 'utf8');
    assert.equal(json.source.reports[0].runId, 'cli-run');
    assert.match(markdown, /Fortnightly quality retrospective/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('keeps the output schema strict and recommendation acceptance gated', async () => {
  const root = await mkdtemp(join(tmpdir(), 'm5-retrospective-'));
  try {
    const schema = JSON.parse(await readFile(join(process.cwd(), 'qa/test-management/schemas/retrospective.schema.json'), 'utf8'));
    await saveReport(root, 'run-failed', report({ status: 'failed', stepOutcome: 'failure' }));
    const result = await createRetrospective({ inputs: [root], start, end, cwd: root });
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.properties.schemaVersion.const, result.schemaVersion);
    assert.equal(schema.properties.window.properties.days.const, 14);
    assert.equal(schema.properties.recommendations.items.properties.status.const, 'proposed');
    assert.equal(schema.properties.recommendations.items.properties.humanApproval.properties.owner.type, 'null');
    assert.deepEqual(
      Object.keys(result.metrics.coverage.backend.summary),
      ['statements', 'branches', 'functions', 'lines']
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
