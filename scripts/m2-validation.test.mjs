import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createIssueContractFromGitHubPayload,
  EXIT_CODES,
  LIMITS,
  run,
  validateDispatchIssueNumber,
  validateIssue
} from './m2-validation.mjs';

const root = process.cwd();
const base = JSON.parse(readFileSync(join(root, 'fixtures/m2/valid-issue.json'), 'utf8'));
const catalogPath = join(root, 'qa/test-management/test-observation-catalog.yml');
const repository = 'moco55-netizen/copilot-quality-harness';

function payload(overrides = {}) {
  return {
    number: 12,
    title: 'Validate deterministic intake',
    state: 'open',
    repository_url: `https://api.github.com/repos/${repository}`,
    html_url: `https://github.com/${repository}/issues/12`,
    labels: [{ name: 'needs-triage' }],
    body: [
      '### 受入条件',
      '- The report maps every criterion to a test observation.',
      '',
      '### 影響範囲',
      'Docs',
      '',
      '### リスク',
      'low',
      '',
      '### テスト要求',
      '- Run the M2 unit tests.'
    ].join('\n'),
    ...overrides
  };
}

function snapshot(directory) {
  return readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
    .map((entry) => entry.isDirectory()
      ? [entry.name, snapshot(join(directory, entry.name))]
      : [entry.name, readFileSync(join(directory, entry.name), 'utf8')]);
}

test('accepts a valid fixture and produces a complete deterministic test design', () => {
  const result = run({ issue: base, root, catalogPath });
  assert.equal(result.exitCode, EXIT_CODES.ok);
  assert.equal(result.status, 'ready-for-human-review');
  assert.equal(result.testDesign.observations.length, 10);
  assert.equal(result.testDesign.acceptanceCriteria.length, base.acceptanceCriteria.length);
  assert.ok(result.testDesign.acceptanceCriteria.every((criterion) => criterion.observationIds.length > 0));
  assert.deepEqual(result.analysis.candidates[0], { path: 'README.md', classification: 'Docs', exists: true, referenceValid: true });
  assert.equal(result.modelCalls, false);
  assert.equal(result.handoff.implementationAllowed, false);
  assert.equal(result.handoff.suggestedBranch, 'work/issue-12');
});

test('rejects malformed contracts, untrusted sources, and configured input overages', () => {
  assert.equal(validateIssue({ ...base, issueNumber: 0, acceptanceCriteria: [] }).valid, false);
  assert.equal(validateIssue({ ...base, extra: 'untrusted property' }).valid, false);
  assert.equal(validateIssue({ ...base, targetPaths: Array(LIMITS.targetPaths + 1).fill('README.md') }).valid, false);
  assert.equal(validateIssue({ ...base, source: { ...base.source, issueNumber: 13 } }).valid, false);
  assert.equal(validateIssue(base, { expectedRepository: repository }).valid, false);
  const result = run({ issue: { ...base, targetPaths: ['../secret.txt'] }, root, catalogPath });
  assert.equal(result.exitCode, EXIT_CODES.invalid);
  assert.equal(result.sourceTrust.verified, true);
});

test('validates canonical bounded workflow dispatch issue numbers', () => {
  assert.deepEqual(validateDispatchIssueNumber('12'), { valid: true, issueNumber: 12, error: null });
  for (const value of ['', '0', '-1', '+1', '01', '1.0', '1e2', '12x', '2147483648', '99999999999']) {
    assert.equal(validateDispatchIssueNumber(value).valid, false, `expected ${value} to be rejected`);
  }
});

test('trusts only a matching open same-repository issue payload', () => {
  const trusted = createIssueContractFromGitHubPayload(payload(), repository, 12);
  assert.equal(trusted.sourceTrusted, true);
  assert.equal(trusted.issue.source.kind, 'github-issue');
  assert.equal(trusted.issue.source.repository, repository);
  assert.equal(trusted.issue.source.bodySha256.length, 64);
  assert.equal(validateIssue(trusted.issue, { expectedRepository: repository }).valid, true);

  for (const untrusted of [
    payload({ number: 13 }),
    payload({ repository_url: 'https://api.github.com/repos/another-owner/copilot-quality-harness' }),
    payload({ html_url: 'https://github.com/another-owner/copilot-quality-harness/issues/12' }),
    payload({ html_url: `https://github.com/attacker.example/prefix/${repository}/issues/12` }),
    payload({ pull_request: { url: 'https://api.github.com/pulls/12' } }),
    payload({ state: 'closed' })
  ]) {
    const result = createIssueContractFromGitHubPayload(untrusted, repository, 12);
    assert.equal(result.sourceTrusted, false);
    assert.equal(result.issue, null);
    assert.ok(result.errors.length > 0);
  }
});

test('stops for high risk, missing information, restricted scope, and oversized issue bodies', () => {
  const high = createIssueContractFromGitHubPayload(payload({ body: payload().body.replace('\nlow\n', '\nhigh\n') }), repository, 12);
  assert.equal(run({ issue: high.issue, root, catalogPath, expectedRepository: repository }).exitCode, EXIT_CODES.unsafe);

  const missing = createIssueContractFromGitHubPayload(payload({ body: '### リスク\nlow' }), repository, 12);
  assert.ok(missing.issue.missingInformation.includes('acceptance criteria'));
  assert.equal(run({ issue: missing.issue, root, catalogPath, expectedRepository: repository }).status, 'unsafe-stop');

  const restricted = createIssueContractFromGitHubPayload(payload({ body: payload().body.replace('Docs', 'Backend authentication') }), repository, 12);
  assert.ok(restricted.issue.policyStops.length > 0);
  assert.equal(run({ issue: restricted.issue, root, catalogPath, expectedRepository: repository }).exitCode, EXIT_CODES.unsafe);

  const oversized = createIssueContractFromGitHubPayload(payload({ body: 'x'.repeat(LIMITS.issueBodyCharacters + 1) }), repository, 12);
  assert.ok(oversized.issue.policyStops.some((reason) => reason.includes('character limit')));
  assert.equal(run({ issue: oversized.issue, root, catalogPath, expectedRepository: repository }).exitCode, EXIT_CODES.unsafe);
});

test('is deterministic and does not modify the repository analysis root', () => {
  const temp = mkdtempSync(join(tmpdir(), 'm2-read-only-'));
  try {
    writeFileSync(join(temp, 'README.md'), 'unchanged\n');
    const before = snapshot(temp);
    const first = run({ issue: { ...base, targetPaths: [] }, root: temp, catalogPath });
    const second = run({ issue: { ...base, targetPaths: [] }, root: temp, catalogPath });
    assert.deepEqual(first, second);
    assert.deepEqual(snapshot(temp), before);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('JSON schemas encode strict trust, output shape, and resource limits', () => {
  const issueSchema = JSON.parse(readFileSync(join(root, 'qa/test-management/schemas/issue-contract.schema.json'), 'utf8'));
  const reportSchema = JSON.parse(readFileSync(join(root, 'qa/test-management/schemas/m2-validation.schema.json'), 'utf8'));
  assert.equal(issueSchema.additionalProperties, false);
  assert.equal(issueSchema.properties.schemaVersion.const, 2);
  assert.equal(issueSchema.properties.source.additionalProperties, false);
  assert.equal(issueSchema.properties.acceptanceCriteria.maxItems, LIMITS.acceptanceCriteria);
  assert.equal(issueSchema.properties.targetPaths.maxItems, LIMITS.targetPaths);
  assert.equal(reportSchema.additionalProperties, false);
  assert.equal(reportSchema.properties.modelCalls.const, false);
  assert.equal(reportSchema.properties.analysis.properties.candidates.maxItems, LIMITS.repositoryFiles);
  assert.deepEqual(reportSchema.properties.status.enum, ['ready-for-human-review', 'invalid', 'unsafe-stop', 'io-error']);
});
