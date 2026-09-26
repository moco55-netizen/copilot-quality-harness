import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXIT_CODES = { ok: 0, invalid: 2, unsafe: 3, io: 4 };
export const LIMITS = {
  issueNumber: 2_147_483_647,
  issueBodyCharacters: 20_000,
  acceptanceCriteria: 20,
  criterionCharacters: 500,
  targetPaths: 50,
  pathCharacters: 512,
  repositoryFiles: 5_000,
  catalogObservations: 100,
  labels: 50
};

const SCHEMA_VERSION = 2;
const SCOPES = new Set(['Frontend', 'Backend', 'API', 'DB', 'Infra', 'Docs']);
const SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'coverage']);

function sourceErrors(source, issueNumber, expectedRepository) {
  const errors = [];
  if (!source || typeof source !== 'object' || Array.isArray(source)) return ['source must be an object'];
  if (!['github-issue', 'local-fixture'].includes(source.kind)) errors.push('source.kind is invalid');
  if (typeof source.repository !== 'string' || !source.repository.trim() || source.repository.length > 200) errors.push('source.repository must be a non-empty string of at most 200 characters');
  if (source.issueNumber !== issueNumber) errors.push('source.issueNumber must match issueNumber');
  if (typeof source.issueUrl !== 'string' || source.issueUrl.length > 500) errors.push('source.issueUrl must be a string of at most 500 characters');
  if (typeof source.bodySha256 !== 'string' || !/^[a-f0-9]{64}$/.test(source.bodySha256)) errors.push('source.bodySha256 must be a SHA-256 hex digest');
  if (source.kind === 'github-issue' && !/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/[1-9]\d*$/.test(source.issueUrl)) errors.push('GitHub issue URL is invalid');
  if (source.kind === 'local-fixture' && source.issueUrl !== '') errors.push('local fixture issueUrl must be empty');
  if (expectedRepository && (source.kind !== 'github-issue' || typeof source.repository !== 'string' ||
    source.repository.toLowerCase() !== expectedRepository.toLowerCase())) {
    errors.push('source must be a trusted issue from the expected repository');
  }
  return errors;
}

function issueErrors(issue, expectedRepository) {
  const errors = [];
  if (!issue || typeof issue !== 'object' || Array.isArray(issue)) return ['issue contract must be an object'];
  const allowedKeys = new Set([
    'schemaVersion', 'issueNumber', 'title', 'source', 'acceptanceCriteria', 'testRequirements',
    'scope', 'severity', 'automationAllowed', 'missingInformation', 'policyStops', 'targetPaths'
  ]);
  for (const key of Object.keys(issue)) if (!allowedKeys.has(key)) errors.push(`unknown issue contract property: ${key}`);
  if (issue.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  if (!Number.isSafeInteger(issue.issueNumber) || issue.issueNumber < 1 || issue.issueNumber > LIMITS.issueNumber) errors.push('issueNumber must be a supported positive integer');
  if (typeof issue.title !== 'string' || !issue.title.trim() || issue.title.length > 256) errors.push('title must be a non-empty string of at most 256 characters');
  errors.push(...sourceErrors(issue.source, issue.issueNumber, expectedRepository));
  if (!Array.isArray(issue.acceptanceCriteria) || issue.acceptanceCriteria.length < 1 || issue.acceptanceCriteria.length > LIMITS.acceptanceCriteria ||
    issue.acceptanceCriteria.some((value) => typeof value !== 'string' || !value.trim() || value.length > LIMITS.criterionCharacters)) {
    errors.push(`acceptanceCriteria must contain 1-${LIMITS.acceptanceCriteria} non-empty strings of at most ${LIMITS.criterionCharacters} characters`);
  }
  if (!Array.isArray(issue.testRequirements) || issue.testRequirements.length < 1 || issue.testRequirements.length > LIMITS.acceptanceCriteria ||
    issue.testRequirements.some((value) => typeof value !== 'string' || !value.trim() || value.length > LIMITS.criterionCharacters)) {
    errors.push('testRequirements must contain non-empty strings of at most 500 characters');
  }
  if (!Array.isArray(issue.scope) || issue.scope.length < 1 || issue.scope.some((value) => !SCOPES.has(value)) || new Set(issue.scope).size !== issue.scope.length) {
    errors.push('scope must contain unique allowed classifications');
  }
  if (!SEVERITIES.has(issue.severity)) errors.push('severity is invalid');
  if (typeof issue.automationAllowed !== 'boolean') errors.push('automationAllowed must be boolean');
  if (!Array.isArray(issue.missingInformation) || issue.missingInformation.some((value) => typeof value !== 'string' || !value.trim() || value.length > 200)) errors.push('missingInformation must be an array of non-empty strings of at most 200 characters');
  if (!Array.isArray(issue.policyStops) || issue.policyStops.some((value) => typeof value !== 'string' || !value.trim() || value.length > 300)) errors.push('policyStops must be an array of non-empty strings of at most 300 characters');
  if (issue.targetPaths !== undefined && (!Array.isArray(issue.targetPaths) || issue.targetPaths.length > LIMITS.targetPaths ||
    new Set(issue.targetPaths).size !== issue.targetPaths.length ||
    issue.targetPaths.some((value) => typeof value !== 'string' || !value.trim() || value.length > LIMITS.pathCharacters))) {
    errors.push(`targetPaths must contain at most ${LIMITS.targetPaths} non-empty relative paths`);
  }
  return errors;
}

export function validateIssue(issue, options = {}) {
  const errors = issueErrors(issue, options.expectedRepository);
  const unsafeReasons = [];
  if (issue?.severity === 'high' || issue?.severity === 'critical') unsafeReasons.push(`severity ${issue.severity} requires human review`);
  if (Array.isArray(issue?.missingInformation) && issue.missingInformation.length) unsafeReasons.push(`missing information: ${issue.missingInformation.join(', ')}`);
  if (Array.isArray(issue?.policyStops) && issue.policyStops.length) unsafeReasons.push(...issue.policyStops);
  if (issue?.automationAllowed !== true) unsafeReasons.push('read-only automation has not been approved for this issue');
  return { valid: errors.length === 0, errors, unsafe: unsafeReasons.length > 0, unsafeReasons };
}

export function validateDispatchIssueNumber(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value)) {
    return { valid: false, issueNumber: null, error: 'issue number must be a canonical positive decimal integer' };
  }
  const issueNumber = Number(value);
  if (!Number.isSafeInteger(issueNumber) || issueNumber > LIMITS.issueNumber) {
    return { valid: false, issueNumber: null, error: `issue number must not exceed ${LIMITS.issueNumber}` };
  }
  return { valid: true, issueNumber, error: null };
}

function repositoryFromUrl(value, host, path) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === host && url.pathname.replace(/\/+$/, '').toLowerCase() === path.toLowerCase();
  } catch {
    return false;
  }
}

function issueSourceErrors(payload, expectedRepository, requestedIssueNumber) {
  const errors = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return ['GitHub issue payload must be an object'];
  if (!Number.isSafeInteger(payload.number) || payload.number !== requestedIssueNumber) errors.push('fetched issue number does not match dispatch input');
  if (typeof expectedRepository !== 'string' || !/^[^/]+\/[^/]+$/.test(expectedRepository)) errors.push('expected repository must use owner/repository form');
  const repoPath = `/repos/${expectedRepository ?? ''}`;
  const issuePath = `/${expectedRepository ?? ''}/issues/${requestedIssueNumber}`;
  if (!repositoryFromUrl(payload.repository_url, 'api.github.com', repoPath)) errors.push('issue payload is not from the expected GitHub repository');
  if (!repositoryFromUrl(payload.html_url, 'github.com', issuePath)) errors.push('issue URL does not match the expected repository and issue number');
  if (payload.pull_request) errors.push('pull requests are not eligible for issue intake');
  if (payload.state !== 'open') errors.push('only open issues may be analyzed');
  if (typeof payload.title !== 'string' || !payload.title.trim() || payload.title.length > 256) errors.push('issue title is missing or exceeds 256 characters');
  if (payload.body !== null && typeof payload.body !== 'string') errors.push('issue body must be a string or null');
  if (!Array.isArray(payload.labels) || payload.labels.length > LIMITS.labels ||
    payload.labels.some((label) => !label || typeof label.name !== 'string' || label.name.length > 50)) errors.push(`issue labels must be at most ${LIMITS.labels} names of at most 50 characters`);
  return errors;
}

function sectionsFromMarkdown(body) {
  const sections = new Map();
  let current = null;
  for (const line of body.split(/\r?\n/)) {
    const heading = line.match(/^#{2,4}\s+(.+?)\s*#*\s*$/);
    if (heading) {
      current = heading[1].trim().toLocaleLowerCase('en-US');
      sections.set(current, []);
    } else if (current) {
      sections.get(current).push(line);
    }
  }
  return sections;
}

function section(sections, names) {
  for (const name of names) {
    const value = sections.get(name.toLocaleLowerCase('en-US'));
    if (value) return value.join('\n').replace(/<!--[\s\S]*?-->/g, '').trim();
  }
  return '';
}

function criteriaFrom(value) {
  return value.split(/\r?\n/).map((line) => line.trim().replace(/^(?:[-*+]|\d+[.)])\s+/, '').trim())
    .filter(Boolean);
}

function extractScope(value) {
  return [...SCOPES].filter((scope) => new RegExp(`(?:^|[^a-z])${scope}(?:$|[^a-z])`, 'i').test(value)).sort();
}

export function createIssueContractFromGitHubPayload(payload, expectedRepository, requestedIssueNumber) {
  const intakeErrors = issueSourceErrors(payload, expectedRepository, requestedIssueNumber);
  if (intakeErrors.length) return { issue: null, sourceTrusted: false, errors: intakeErrors };

  const body = payload.body ?? '';
  const bodySha256 = createHash('sha256').update(body, 'utf8').digest('hex');
  const source = {
    kind: 'github-issue',
    repository: expectedRepository,
    issueNumber: payload.number,
    issueUrl: payload.html_url,
    bodySha256
  };
  const sections = sectionsFromMarkdown(body);
  const acceptanceText = section(sections, ['受入条件', 'acceptance criteria', 'expected behavior', '期待結果']);
  const testText = section(sections, ['テスト要求', 'テスト', 'test requirements', 'tests']);
  const scopeText = section(sections, ['影響範囲', 'scope', '影響範囲とseverity']);
  const severityText = section(sections, ['リスク', 'severity', '影響範囲とseverity']).toLowerCase();
  const parsedAcceptanceCriteria = criteriaFrom(acceptanceText);
  const parsedTestRequirements = criteriaFrom(testText);
  const acceptanceCriteria = parsedAcceptanceCriteria.slice(0, LIMITS.acceptanceCriteria).map((criterion) => criterion.slice(0, LIMITS.criterionCharacters));
  const testRequirements = parsedTestRequirements.slice(0, LIMITS.acceptanceCriteria).map((requirement) => requirement.slice(0, LIMITS.criterionCharacters));
  const scope = extractScope(scopeText);
  const severity = SEVERITIES.has(severityText) ? severityText : 'medium';
  const missingInformation = [];
  if (!acceptanceCriteria.length) missingInformation.push('acceptance criteria');
  if (!testRequirements.length) missingInformation.push('test requirements');
  if (!scope.length) missingInformation.push('allowed scope');
  if (!SEVERITIES.has(severityText)) missingInformation.push('severity');
  const policyStops = [];
  if (body.length > LIMITS.issueBodyCharacters) policyStops.push(`issue body exceeds the ${LIMITS.issueBodyCharacters}-character limit`);
  if (parsedAcceptanceCriteria.length > LIMITS.acceptanceCriteria || parsedTestRequirements.length > LIMITS.acceptanceCriteria ||
    [...parsedAcceptanceCriteria, ...parsedTestRequirements].some((value) => value.length > LIMITS.criterionCharacters)) {
    policyStops.push('acceptance criteria or test requirements exceed the configured input limit');
  }
  if (/(?:\bauth(?:entication|orization)?\b|\bpersonal data\b|\bpii\b|\bpayment(?:s)?\b|\bbilling\b|\bdrop\s+table\b|\btruncate\b|\bdestructive\s+(?:database|db)\b|認証|個人情報|決済|破壊的.{0,12}(?:DB|データベース))/i.test(`${payload.title}\n${body}`)) {
    policyStops.push('issue mentions a restricted security, personal-data, payment, or destructive-database scope');
  }
  const issue = {
    schemaVersion: SCHEMA_VERSION,
    issueNumber: payload.number,
    title: payload.title,
    source,
    acceptanceCriteria: acceptanceCriteria.length ? acceptanceCriteria : ['Missing acceptance criteria'],
    testRequirements: testRequirements.length ? testRequirements : ['Missing test requirements'],
    scope: scope.length ? scope : ['Docs'],
    severity,
    automationAllowed: missingInformation.length === 0 && policyStops.length === 0 && severity !== 'high' && severity !== 'critical',
    missingInformation,
    policyStops,
    targetPaths: []
  };
  return { issue, sourceTrusted: true, errors: [] };
}

function safePath(root, candidate) {
  if (isAbsolute(candidate) || candidate.split(/[\\/]/).includes('..')) return null;
  const full = resolve(root, candidate);
  const rel = relative(root, full);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`)) return null;
  try {
    const realRoot = realpathSync(root);
    const realFile = realpathSync(full);
    const realRel = relative(realRoot, realFile);
    return realRel && realRel !== '..' && !realRel.startsWith(`..${sep}`) ? full : null;
  } catch {
    return null;
  }
}

function classify(path) {
  const normalized = path.replaceAll('\\', '/');
  if (normalized.startsWith('frontend/')) return 'Frontend';
  if (normalized.startsWith('backend/')) return 'Backend';
  if (normalized.startsWith('e2e/')) return 'API';
  if (normalized.startsWith('.github/')) return 'Infra';
  if (normalized.startsWith('qa/') || normalized.endsWith('.md')) return 'Docs';
  return 'Infra';
}

function walk(root, current = root, files = []) {
  for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    if (entry.isSymbolicLink() || IGNORED_DIRECTORIES.has(entry.name)) continue;
    const full = resolve(current, entry.name);
    if (entry.isDirectory()) walk(root, full, files);
    else if (entry.isFile()) {
      files.push(relative(root, full).replaceAll('\\', '/'));
      if (files.length > LIMITS.repositoryFiles) throw new Error(`repository exceeds the ${LIMITS.repositoryFiles}-file analysis limit`);
    }
  }
  return files;
}

export function analyzeRepository(root, targetPaths = []) {
  const rootPath = realpathSync(root);
  if (!statSync(rootPath).isDirectory()) throw new Error('analysis root must be a directory');
  if (!Array.isArray(targetPaths) || targetPaths.length > LIMITS.targetPaths) throw new Error(`targetPaths exceeds the ${LIMITS.targetPaths}-path limit`);
  const paths = targetPaths.length ? targetPaths : walk(rootPath);
  const candidates = paths.map((candidate) => {
    const full = safePath(rootPath, candidate);
    const normalized = candidate.replaceAll('\\', '/');
    const exists = Boolean(full && lstatSync(full).isFile());
    return { path: normalized, classification: classify(normalized), exists, referenceValid: exists };
  });
  const references = candidates.filter((candidate) => !candidate.exists).map((candidate) => candidate.path);
  return {
    schemaVersion: SCHEMA_VERSION,
    root: '.',
    candidates,
    references,
    valid: references.length === 0,
    scope: [...new Set(candidates.map((candidate) => candidate.classification))].sort()
  };
}

export function readCatalog(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  const catalog = lines.filter((line) => /^\s+-\s+\S/.test(line)).map((line) => line.replace(/^\s+-\s+/, '').trim());
  if (!catalog.length || catalog.length > LIMITS.catalogObservations || new Set(catalog).size !== catalog.length ||
    catalog.some((id) => id.length > 100)) throw new Error(`observation catalog must contain 1-${LIMITS.catalogObservations} unique IDs of at most 100 characters`);
  return catalog;
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
    observationIds: [catalog[index % catalog.length]]
  }));
  return {
    schemaVersion: SCHEMA_VERSION,
    issueNumber: issue.issueNumber,
    observations,
    acceptanceCriteria,
    testRequirements: issue.testRequirements,
    referencedPaths: analysis.candidates.map((candidate) => candidate.path)
  };
}

function resultForStop(status, exitCode, errors, issue, sourceTrusted) {
  const validIssue = issue && issueErrors(issue).length === 0;
  const source = validIssue ? issue.source : null;
  const report = {
    schemaVersion: SCHEMA_VERSION,
    exitCode,
    status,
    errors,
    sourceTrust: {
      verified: sourceTrusted,
      kind: ['github-issue', 'local-fixture'].includes(source?.kind) ? source.kind : 'unverified',
      repository: typeof source?.repository === 'string' ? source.repository.slice(0, 200) : '',
      issueNumber: Number.isSafeInteger(issue?.issueNumber) && issue.issueNumber > 0 && issue.issueNumber <= LIMITS.issueNumber ? issue.issueNumber : null,
      issueUrl: typeof source?.issueUrl === 'string' ? source.issueUrl.slice(0, 500) : ''
    },
    modelCalls: false
  };
  if (validIssue) report.issue = issue;
  if (status === 'unsafe-stop') report.stopConditions = errors;
  return report;
}

export function run(input) {
  const validation = validateIssue(input.issue, { expectedRepository: input.expectedRepository });
  const sourceTrusted = sourceErrors(input.issue?.source, input.issue?.issueNumber, input.expectedRepository).length === 0;
  if (!validation.valid) return resultForStop('invalid', EXIT_CODES.invalid, validation.errors, input.issue, sourceTrusted);
  if (validation.unsafe) return resultForStop('unsafe-stop', EXIT_CODES.unsafe, validation.unsafeReasons, input.issue, true);
  let analysis;
  try {
    analysis = analyzeRepository(input.root, input.issue.targetPaths ?? []);
  } catch (error) {
    if (error.message.startsWith('repository exceeds the ')) {
      return resultForStop('unsafe-stop', EXIT_CODES.unsafe, [error.message], input.issue, true);
    }
    throw error;
  }
  if (!analysis.valid) return resultForStop('invalid', EXIT_CODES.invalid, analysis.references.map((path) => `reference does not exist or is outside the repository: ${path}`), input.issue, true);
  const catalog = readCatalog(input.catalogPath);
  const testDesign = designTests(input.issue, analysis, catalog);
  return {
    schemaVersion: SCHEMA_VERSION,
    exitCode: EXIT_CODES.ok,
    status: 'ready-for-human-review',
    errors: [],
    issue: input.issue,
    sourceTrust: {
      verified: true,
      kind: input.issue.source.kind,
      repository: input.issue.source.repository,
      issueNumber: input.issue.issueNumber,
      issueUrl: input.issue.source.issueUrl
    },
    modelCalls: false,
    analysis,
    testDesign,
    handoff: {
      mode: 'human-review-only',
      suggestedBranch: `work/issue-${input.issue.issueNumber}`,
      implementationAllowed: false,
      requiresManualApproval: true,
      constrainedInputs: {
        repository: input.issue.source.repository,
        issueNumber: input.issue.issueNumber,
        issueUrl: input.issue.source.issueUrl,
        baseRef: 'main'
      }
    }
  };
}

function parseArgs(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith('--')) {
      const key = args[index].slice(2);
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`missing value for --${key}`);
      values[key] = value;
      index += 1;
    }
  }
  return values;
}

function writeResult(path, result) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  try {
    if (!args.catalog || !args.output || (!args.issue && !args['github-issue'])) {
      throw new Error('usage: node scripts/m2-validation.mjs --issue FILE | --github-issue FILE [--issue-number NUMBER --repository OWNER/REPO] --catalog FILE --root DIR --output FILE');
    }
    let issue;
    let sourceTrusted = true;
    let intakeErrors = [];
    if (args['github-issue']) {
      const issueNumber = validateDispatchIssueNumber(args['issue-number'] ?? '');
      if (!issueNumber.valid || !args.repository) {
        sourceTrusted = false;
        intakeErrors = [issueNumber.error ?? 'repository must be supplied as owner/repository'];
      } else {
        const payload = JSON.parse(readFileSync(args['github-issue'], 'utf8'));
        const intake = createIssueContractFromGitHubPayload(payload, args.repository, issueNumber.issueNumber);
        issue = intake.issue;
        sourceTrusted = intake.sourceTrusted;
        intakeErrors = intake.errors;
      }
    } else {
      issue = JSON.parse(readFileSync(args.issue, 'utf8'));
    }
    let result;
    if (intakeErrors.length) {
      result = resultForStop('invalid', EXIT_CODES.invalid, intakeErrors, issue, sourceTrusted);
    } else {
      result = run({
        issue,
        root: resolve(args.root ?? '.'),
        catalogPath: resolve(args.catalog),
        expectedRepository: args.repository
      });
    }
    writeResult(resolve(args.output), result);
    console.log(JSON.stringify({ status: result.status, output: args.output }));
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(JSON.stringify({ status: 'io-error', error: error.message }));
    process.exitCode = EXIT_CODES.io;
  }
}
