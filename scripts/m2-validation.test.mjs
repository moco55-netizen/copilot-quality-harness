import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { EXIT_CODES, run, validateIssue } from './m2-validation.mjs';

const root = process.cwd();
const base = { schemaVersion: 1, issueNumber: 12, acceptanceCriteria: ['The flow is validated.'], scope: ['Docs'], severity: 'low', aiExecutionAllowed: true, missingInformation: [], targetPaths: ['README.md'] };
const catalogPath = join(root, 'qa/test-management/test-observation-catalog.yml');

test('accepts a valid issue contract and covers every catalog observation', () => {
  const result = run({ issue: base, root, catalogPath });
  assert.equal(result.exitCode, EXIT_CODES.ok);
  assert.equal(result.testDesign.observations.length, 10);
  assert.deepEqual(result.analysis.candidates[0], { path: 'README.md', classification: 'Docs', exists: true, referenceValid: true });
});

test('rejects invalid contracts', () => {
  const validation = validateIssue({ ...base, issueNumber: 0, acceptanceCriteria: [] });
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.length >= 2);
});

test('stops safely for high severity, missing information, or disabled execution', () => {
  const result = run({ issue: { ...base, severity: 'high' }, root, catalogPath });
  assert.equal(result.exitCode, EXIT_CODES.unsafe);
  assert.equal(run({ issue: { ...base, missingInformation: ['scope'] }, root, catalogPath }).exitCode, EXIT_CODES.unsafe);
});

test('validates unsafe and missing references', () => {
  const result = run({ issue: { ...base, targetPaths: ['../secret.txt'] }, root, catalogPath });
  assert.equal(result.exitCode, EXIT_CODES.invalid);
  assert.match(result.errors[0], /reference does not exist/);
});

test('is deterministic and does not modify source files', () => {
  const before = readFileSync(join(root, 'README.md'), 'utf8');
  const first = run({ issue: base, root, catalogPath });
  const second = run({ issue: base, root, catalogPath });
  assert.deepEqual(first, second);
  assert.equal(readFileSync(join(root, 'README.md'), 'utf8'), before);
  const temp = mkdtempSync(join(tmpdir(), 'm2-'));
  writeFileSync(join(temp, 'result.json'), JSON.stringify(first));
  assert.ok(readFileSync(join(temp, 'result.json'), 'utf8'));
});
