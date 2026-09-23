import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXIT_CODES = { ok: 0, invalid: 2, unsafe: 3, io: 4 };
const SCOPES = new Set(['Frontend', 'Backend', 'API', 'DB', 'Infra', 'Docs']);
const SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);

function issueErrors(issue) {
  const errors = [];
  if (!issue || typeof issue !== 'object') return ['issue contract must be an object'];
  if (issue.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!Number.isInteger(issue.issueNumber) || issue.issueNumber < 1) errors.push('issueNumber must be a positive integer');
  if (!Array.isArray(issue.acceptanceCriteria) || issue.acceptanceCriteria.length === 0 || issue.acceptanceCriteria.some((value) => typeof value !== 'string' || !value.trim())) {
    errors.push('acceptanceCriteria must contain at least one non-empty string');
  }
  if (!Array.isArray(issue.scope) || issue.scope.some((value) => !SCOPES.has(value))) errors.push('scope contains an invalid classification');
  if (!SEVERITIES.has(issue.severity)) errors.push('severity is invalid');
  if (typeof issue.aiExecutionAllowed !== 'boolean') errors.push('aiExecutionAllowed must be boolean');
  if (!Array.isArray(issue.missingInformation) || issue.missingInformation.some((value) => typeof value !== 'string')) errors.push('missingInformation must be an array of strings');
  if (issue.targetPaths !== undefined && (!Array.isArray(issue.targetPaths) || issue.targetPaths.some((value) => typeof value !== 'string' || !value.trim()))) errors.push('targetPaths must be an array of non-empty strings');
  return errors;
}

export function validateIssue(issue) {
  const errors = issueErrors(issue);
  const unsafeReasons = [];
  if (issue?.severity === 'high' || issue?.severity === 'critical') unsafeReasons.push(`severity ${issue.severity} requires human review`);
  if (issue?.missingInformation?.length) unsafeReasons.push('missingInformation is not empty');
  if (issue?.aiExecutionAllowed !== true) unsafeReasons.push('aiExecutionAllowed is false');
  return { valid: errors.length === 0, errors, unsafe: unsafeReasons.length > 0, unsafeReasons };
}

function safePath(root, candidate) {
  if (isAbsolute(candidate) || candidate.split(/[\\/]/).includes('..')) return null;
  const full = resolve(root, candidate);
  const rel = relative(root, full);
  return rel && !rel.startsWith(`..${sep}`) && rel !== '..' ? full : null;
}

function classify(path) {
  const normalized = path.replaceAll('\\', '/');
  if (normalized.startsWith('frontend/')) return 'Frontend';
  if (normalized.startsWith('backend/')) return 'Backend';
  if (normalized.startsWith('e2e/')) return 'API';
  if (normalized.startsWith('.github/')) return 'Infra';
  if (normalized.startsWith('qa/') || normalized.endsWith('.md')) return 'Docs';
  return 'Docs';
}

function walk(root, current = root) {
  return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'coverage') return [];
    const full = resolve(current, entry.name);
    return entry.isDirectory() ? walk(root, full) : [relative(root, full).replaceAll('\\', '/')];
  }).sort();
}

export function analyzeRepository(root, targetPaths = []) {
  const files = walk(root);
  const candidates = (targetPaths.length ? targetPaths : files).map((candidate) => {
    const full = safePath(root, candidate);
    const normalized = candidate.replaceAll('\\', '/');
    const exists = Boolean(full && existsSync(full) && statSync(full).isFile());
    return { path: normalized, classification: classify(normalized), exists, referenceValid: exists };
  });
  const references = candidates.filter((candidate) => !candidate.exists).map((candidate) => candidate.path);
  return {
    schemaVersion: 1,
    root: '.',
    candidates,
    references,
    valid: references.length === 0,
    scope: [...new Set(candidates.map((candidate) => candidate.classification))].sort()
  };
}

export function readCatalog(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  return lines.filter((line) => /^\s+-\s+\S/.test(line)).map((line) => line.replace(/^\s+-\s+/, '').trim());
}

export function designTests(issue, analysis, catalog) {
  const observations = catalog.map((id) => ({
    id,
    status: 'planned',
    reason: `Covers ${id} for issue ${issue.issueNumber}`,
    level: id === 'primary-user-flow' ? 'e2e' : 'unit',
    residualRisk: 'Execution is required before release.'
  }));
  const acceptanceCriteria = issue.acceptanceCriteria.map((criterion, index) => ({
    id: `acceptance-${index + 1}`,
    criterion,
    observationIds: catalog.slice(0, 1)
  }));
  return { schemaVersion: 1, issueNumber: issue.issueNumber, observations, acceptanceCriteria, referencedPaths: analysis.candidates.map((candidate) => candidate.path) };
}

export function run(input) {
  const validation = validateIssue(input.issue);
  if (!validation.valid) return { exitCode: EXIT_CODES.invalid, status: 'invalid', errors: validation.errors };
  if (validation.unsafe) return { exitCode: EXIT_CODES.unsafe, status: 'unsafe-stop', errors: validation.unsafeReasons };
  const analysis = analyzeRepository(input.root, input.issue.targetPaths ?? []);
  if (!analysis.valid) return { exitCode: EXIT_CODES.invalid, status: 'invalid', errors: analysis.references.map((path) => `reference does not exist: ${path}`), analysis };
  const catalog = readCatalog(input.catalogPath);
  if (!catalog.length) return { exitCode: EXIT_CODES.io, status: 'io-error', errors: ['observation catalog is empty'] };
  return { exitCode: EXIT_CODES.ok, status: 'ok', issue: input.issue, analysis, testDesign: designTests(input.issue, analysis, catalog) };
}

function parseArgs(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith('--')) values[args[index].slice(2)] = args[++index];
  }
  return values;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  try {
    if (!args.issue || !args.catalog || !args.output) throw new Error('usage: node scripts/m2-validation.mjs --issue FILE --catalog FILE --output FILE [--root DIR]');
    const root = resolve(args.root ?? dirname(args.issue));
    const result = run({ issue: JSON.parse(readFileSync(args.issue, 'utf8')), root, catalogPath: args.catalog });
    mkdirSync(dirname(resolve(args.output)), { recursive: true });
    writeFileSync(args.output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ status: result.status, output: args.output }));
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(JSON.stringify({ status: 'io-error', error: error.message }));
    process.exitCode = EXIT_CODES.io;
  }
}
