import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createReport, formatSummary, writeReport } from './quality-report.mjs';

const generatedAt = '2026-01-02T03:04:05.000Z';
const successfulSteps = {
  QUALITY_INSTALL: 'success',
  QUALITY_REPORT_TESTS: 'success',
  QUALITY_UNIT: 'success',
  QUALITY_M5_TESTS: 'success',
  QUALITY_M2_TESTS: 'success',
  QUALITY_M2_VALIDATION: 'success',
  QUALITY_BUILD: 'success',
  QUALITY_LINT: 'success',
  QUALITY_PLAYWRIGHT_INSTALL: 'success',
  QUALITY_E2E: 'success'
};

async function writeCoverage(root, scope, percent = 80) {
  const directory = join(root, scope, 'coverage');
  await mkdir(directory, { recursive: true });
  const values = Object.fromEntries(['statements', 'branches', 'functions', 'lines'].map((name) => [
    name,
    { total: 10, covered: 8, skipped: 0, pct: percent }
  ]));
  await writeFile(join(directory, 'coverage-summary.json'), JSON.stringify({ total: values }));
}

test('reports measured CI outcomes and coverage from the same run', async () => {
  const root = await mkdtemp(join(tmpdir(), 'quality-report-'));
  try {
    await writeCoverage(root, 'backend');
    await writeCoverage(root, 'frontend', 75);
    const report = await createReport({
      root,
      generatedAt,
      env: {
        ...successfulSteps,
        GITHUB_RUN_ID: '12345',
        GITHUB_RUN_ATTEMPT: '2',
        GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_WORKFLOW: 'Quality',
        GITHUB_HEAD_REF: 'feature/test',
        GITHUB_SHA: 'abc123',
        QUALITY_STARTED_AT: '2026-01-02T03:00:00.000Z'
      }
    });

    assert.equal(report.status, 'passed');
    assert.equal(report.runId, '12345');
    assert.equal(report.workflow.url, 'https://github.com/owner/repo/actions/runs/12345');
    assert.equal(report.workflow.attempt, 2);
    assert.equal(report.steps.unit.outcome, 'success');
    assert.equal(report.coverage.frontend.metrics.lines.percent, 75);
    assert.ok(report.unmeasured.some(({ metric }) => metric === 'test counts'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('never reports success when a required test step failed or did not run', async () => {
  const root = await mkdtemp(join(tmpdir(), 'quality-report-'));
  try {
    await writeCoverage(root, 'backend');
    await writeCoverage(root, 'frontend');
    const failed = await createReport({
      root,
      generatedAt,
      env: { ...successfulSteps, GITHUB_RUN_ID: '12345', QUALITY_E2E: 'failure' }
    });
    assert.equal(failed.status, 'failed');
    assert.ok(failed.failures.includes('e2e step failure.'));

    const skipped = await createReport({
      root,
      generatedAt,
      env: { ...successfulSteps, GITHUB_RUN_ID: '12346', QUALITY_E2E: 'skipped' }
    });
    assert.equal(skipped.status, 'not-run');
    assert.ok(skipped.unexecuted.includes('e2e (skipped).'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('fails closed when successful CI steps have missing or below-threshold coverage', async () => {
  const root = await mkdtemp(join(tmpdir(), 'quality-report-'));
  try {
    await writeCoverage(root, 'backend', 9);
    const report = await createReport({
      root,
      generatedAt,
      env: { ...successfulSteps, GITHUB_RUN_ID: '12345' }
    });
    assert.equal(report.status, 'failed');
    assert.equal(report.coverage.frontend.status, 'not-measured');
    assert.ok(report.failures.includes('backend statements coverage 9% is below the 10% threshold.'));
    assert.ok(report.failures.includes('frontend coverage was not measured.'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('writes one report and builds the workflow summary from that report data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'quality-report-'));
  try {
    const summaryPath = join(root, 'step-summary.md');
    const report = await createReport({ root, generatedAt, env: {} });
    await writeReport(report, { root, env: { GITHUB_STEP_SUMMARY: summaryPath } });
    const saved = JSON.parse(await readFile(join(root, 'qa/test-management/reports/test-result.json'), 'utf8'));
    const summary = await readFile(summaryPath, 'utf8');

    assert.deepEqual(saved, report);
    assert.equal(report.status, 'not-run');
    assert.match(summary, /\*\*Outcome:\*\* not-run/);
    assert.match(summary, /Local run \(GitHub Actions metadata unavailable\)/);
    assert.match(summary, /not measured/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('keeps the test-result schema strict and aligned with emitted evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'quality-report-'));
  try {
    const schema = JSON.parse(await readFile(join(process.cwd(), 'qa/test-management/schemas/test-result.schema.json'), 'utf8'));
    const report = await createReport({ root, generatedAt, env: {} });
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.properties.schemaVersion.const, report.schemaVersion);
    assert.equal(schema.properties.steps.additionalProperties, false);
    assert.deepEqual(schema.properties.steps.required, Object.keys(report.steps));
    assert.deepEqual(schema.properties.coverage.required, Object.keys(report.coverage));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
