import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 14;
const MAX_REPORTS = 500;
const REPORT_NAME = 'test-result.json';
const STATUSES = new Set(['passed', 'failed', 'not-run']);
const STEP_OUTCOMES = new Set(['success', 'failure', 'cancelled', 'skipped', 'not-run']);
const COVERAGE_METRICS = ['statements', 'branches', 'functions', 'lines'];
const UNAVAILABLE_METRICS = [
  {
    metric: 'PR conversion',
    reason: 'M3 test-result reports do not link workflow runs to PR creation outcomes.'
  },
  {
    metric: 'retry counts',
    reason: 'A report may contain an observed attempt number, but the input set does not establish that every attempt was collected.'
  },
  {
    metric: 'false positives',
    reason: 'M3 test-result reports do not record issue or defect adjudication outcomes.'
  },
  {
    metric: 'decisions and adoption',
    reason: 'M3 test-result reports do not record human decisions or whether proposed changes were adopted.'
  },
  {
    metric: 'issue outcomes',
    reason: 'M3 test-result reports do not link runs to issue-resolution outcomes.'
  },
  {
    metric: 'trend baseline',
    reason: 'No comparable baseline is provided by the selected reports.'
  }
];

class RetrospectiveError extends Error {
  constructor(message, exitCode = 2) {
    super(message);
    this.name = 'RetrospectiveError';
    this.exitCode = exitCode;
  }
}

function timestamp(value, label) {
  if (typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new RetrospectiveError(`${label} must be an ISO 8601 date-time with an explicit timezone.`);
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new RetrospectiveError(`${label} is not a valid date-time.`);
  return milliseconds;
}

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RetrospectiveError(`${label} must be a non-empty string.`);
  }
}

function validateReport(report, path) {
  const fail = (reason) => { throw new RetrospectiveError(`Malformed report ${path}: ${reason}`); };
  if (!report || typeof report !== 'object' || Array.isArray(report)) fail('expected a JSON object.');
  if (report.schemaVersion !== 2) fail('expected M3 test-result schemaVersion 2.');
  try {
    requiredString(report.runId, 'runId');
    timestamp(report.generatedAt, 'generatedAt');
  } catch (error) {
    fail(error.message);
  }
  if (!STATUSES.has(report.status)) fail('status must be passed, failed, or not-run.');
  if (!report.workflow || typeof report.workflow !== 'object' || Array.isArray(report.workflow)) {
    fail('workflow must be an object.');
  }
  if (!Object.hasOwn(report.workflow, 'attempt') ||
    (report.workflow.attempt !== null &&
      (!Number.isInteger(report.workflow.attempt) || report.workflow.attempt < 1))) {
    fail('workflow.attempt must be a positive integer or null.');
  }
  if (report.workflow.startedAt !== null) {
    try {
      timestamp(report.workflow.startedAt, 'workflow.startedAt');
    } catch (error) {
      fail(error.message);
    }
  }
  if (!report.steps || typeof report.steps !== 'object' || Array.isArray(report.steps) ||
    Object.keys(report.steps).length === 0) fail('steps must be a non-empty object.');
  for (const [name, step] of Object.entries(report.steps)) {
    if (!step || typeof step !== 'object' || !STEP_OUTCOMES.has(step.outcome)) {
      fail(`step ${name} has an unsupported outcome.`);
    }
  }
  if (!Array.isArray(report.failures) || !report.failures.every((failure) => typeof failure === 'string')) {
    fail('failures must be an array of strings.');
  }
  if (!report.coverage || typeof report.coverage !== 'object') fail('coverage must be an object.');
  for (const scope of ['backend', 'frontend']) {
    const coverage = report.coverage[scope];
    if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage) ||
      typeof coverage.path !== 'string' || !Number.isFinite(coverage.thresholdPercent) ||
      coverage.thresholdPercent < 0 || coverage.thresholdPercent > 100) {
      fail(`${scope} coverage is missing or malformed.`);
    }
    if (coverage.status === 'not-measured') {
      if (coverage.metrics !== null || typeof coverage.reason !== 'string' || !coverage.reason.trim()) {
        fail(`${scope} unavailable coverage must include a reason and null metrics.`);
      }
      continue;
    }
    if (coverage.status !== 'measured' || !coverage.metrics ||
      typeof coverage.metrics !== 'object' || Array.isArray(coverage.metrics) ||
      coverage.reason !== null) {
      fail(`${scope} coverage status must be measured or not-measured.`);
    }
    for (const metric of COVERAGE_METRICS) {
      const value = coverage.metrics[metric];
      if (!value || typeof value !== 'object' || Array.isArray(value) ||
        !Number.isFinite(value.covered) || !Number.isFinite(value.total) ||
        !Number.isFinite(value.percent) || value.covered < 0 || value.total < 0 ||
        value.percent < 0 || value.percent > 100) {
        fail(`${scope} ${metric} coverage measurement is invalid.`);
      }
    }
  }
}

async function collectReports(inputs) {
  const found = new Set();
  async function visit(path) {
    let info;
    try {
      info = await stat(path);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
        throw new RetrospectiveError(`Input path does not exist: ${path}`, 4);
      }
      throw new RetrospectiveError(`Cannot inspect input path ${path}: ${error.message}`, 4);
    }
    if (info.isDirectory()) {
      let entries;
      try {
        entries = await readdir(path, { withFileTypes: true });
      } catch (error) {
        throw new RetrospectiveError(`Cannot read input directory ${path}: ${error.message}`, 4);
      }
      entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
      for (const entry of entries) {
        const entryPath = join(path, entry.name);
        if (entry.isDirectory()) await visit(entryPath);
        else if (entry.isFile() && entry.name === REPORT_NAME) found.add(resolve(entryPath));
      }
      return;
    }
    if (info.isFile()) {
      found.add(resolve(path));
      return;
    }
    throw new RetrospectiveError(`Input path is not a regular file or directory: ${path}`, 4);
  }

  for (const input of inputs) await visit(input);
  const paths = [...found].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  if (paths.length === 0) {
    throw new RetrospectiveError(`No ${REPORT_NAME} reports were found in the supplied inputs.`, 3);
  }
  if (paths.length > MAX_REPORTS) {
    throw new RetrospectiveError(`Found ${paths.length} reports; the limit is ${MAX_REPORTS}. Narrow the input directory.`, 2);
  }

  return Promise.all(paths.map(async (path) => {
    let report;
    try {
      report = JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new RetrospectiveError(`Malformed report ${path}: invalid JSON.`);
      }
      throw new RetrospectiveError(`Cannot read report ${path}: ${error.message}`, 4);
    }
    validateReport(report, path);
    return { path, report };
  }));
}

function publicPath(path, cwd) {
  const value = relative(cwd, path);
  return (isAbsolute(value) ? path : value || basename(path)).split(sep).join('/');
}

function measuredCoverage(records, scope, cwd) {
  const observed = [];
  const unavailableReports = [];
  for (const { path, report, observedAt } of records) {
    const coverage = report.coverage[scope];
    if (coverage.status !== 'measured') {
      unavailableReports.push({
        path: publicPath(path, cwd),
        runId: report.runId,
        observedAt,
        reason: coverage.reason
      });
      continue;
    }
    observed.push({
      path: publicPath(path, cwd),
      runId: report.runId,
      observedAt,
      metrics: Object.fromEntries(COVERAGE_METRICS.map((metric) => [
        metric,
        { ...coverage.metrics[metric] }
      ]))
    });
  }
  const summary = Object.fromEntries(COVERAGE_METRICS.map((metric) => {
    const values = observed.map(({ metrics }) => metrics[metric].percent);
    return [metric, values.length === 0 ? null : {
      observations: values.length,
      meanPercent: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4)),
      minPercent: Math.min(...values),
      maxPercent: Math.max(...values)
    }];
  }));
  return { observed, unavailableReports, summary };
}

function recommendations(stepFailures) {
  return stepFailures.map(({ step, count, evidence }) => ({
    id: `review-${step}`,
    status: 'proposed',
    title: `Review observed ${step} step failure${count === 1 ? '' : 's'}`,
    evidenceRunIds: [...new Set(evidence.map(({ runId }) => runId))],
    hypothesis: `A human investigation of the observed ${step} failure${count === 1 ? '' : 's'} may identify a cause worth addressing; no cause is inferred by this report.`,
    verificationMethod: `A human owner should record the cause and deadline, then verify the proposed response against a later observed ${step} outcome.`,
    humanApproval: { status: 'required', owner: null, deadline: null }
  }));
}

export async function createRetrospective({ inputs, start, end, generatedAt = new Date().toISOString(), cwd = process.cwd() } = {}) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new RetrospectiveError('Supply at least one --input path.');
  }
  const startMs = timestamp(start, '--start');
  const endMs = timestamp(end, '--end');
  if (endMs - startMs !== WINDOW_DAYS * DAY_MS) {
    throw new RetrospectiveError(`The retrospective window must be exactly ${WINDOW_DAYS} days (end is exclusive).`);
  }
  timestamp(generatedAt, 'generatedAt');

  const inputsAbsolute = inputs.map((input) => resolve(cwd, input));
  const allReports = await collectReports(inputsAbsolute);
  const included = [];
  const excluded = [];
  for (const { path, report } of allReports) {
    const field = report.workflow.startedAt ? 'workflow.startedAt' : 'generatedAt';
    const observedAt = report.workflow.startedAt || report.generatedAt;
    const observedMs = timestamp(observedAt, `${path} ${field}`);
    const item = {
      path,
      report,
      observedAt: new Date(observedMs).toISOString(),
      timestampField: field
    };
    if (observedMs >= startMs && observedMs < endMs) included.push(item);
    else excluded.push(item);
  }
  if (included.length === 0) {
    const exclusions = excluded.map(({ path, report, observedAt }) =>
      `${publicPath(path, cwd)} (run ${report.runId}, observed ${observedAt})`
    );
    throw new RetrospectiveError(
      `No suitable reports fall within [${new Date(startMs).toISOString()}, ${new Date(endMs).toISOString()}).` +
      (exclusions.length ? ` Out-of-window reports: ${exclusions.join('; ')}.` : ''),
      3
    );
  }

  const sources = included.map(({ path, report, observedAt, timestampField }) => ({
    path: publicPath(path, cwd),
    runId: report.runId,
    attempt: Number.isInteger(report.workflow.attempt) ? report.workflow.attempt : null,
    observedAt,
    timestampField,
    status: report.status
  }));
  const reportCounts = {
    total: included.length,
    passed: included.filter(({ report }) => report.status === 'passed').length,
    failed: included.filter(({ report }) => report.status === 'failed').length,
    notRun: included.filter(({ report }) => report.status === 'not-run').length
  };
  const failureMap = new Map();
  for (const { path, report } of included) {
    for (const [step, value] of Object.entries(report.steps)) {
      if (value.outcome !== 'failure') continue;
      if (!failureMap.has(step)) failureMap.set(step, []);
      failureMap.get(step).push({ path: publicPath(path, cwd), runId: report.runId });
    }
  }
  const stepFailures = [...failureMap.entries()].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0)
    .map(([step, evidence]) => ({ step, count: evidence.length, evidence }));
  const coverage = Object.fromEntries(['backend', 'frontend'].map((scope) => [
    scope,
    measuredCoverage(included, scope, cwd)
  ]));

  return {
    schemaVersion: 1,
    generatedAt: new Date(timestamp(generatedAt, 'generatedAt')).toISOString(),
    window: {
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      endExclusive: true,
      days: WINDOW_DAYS
    },
    source: {
      reportCount: included.length,
      reports: sources,
      outOfWindowReports: excluded.map(({ path, report, observedAt, timestampField }) => ({
        path: publicPath(path, cwd),
        runId: report.runId,
        observedAt,
        timestampField
      }))
    },
    metrics: {
      reports: reportCounts,
      stepFailures,
      coverage
    },
    unavailableMetrics: UNAVAILABLE_METRICS,
    recommendations: recommendations(stepFailures)
  };
}

function percent(value) {
  return value === null ? 'unavailable' : `${value}%`;
}

export function formatMarkdown(retrospective) {
  const { window, source, metrics } = retrospective;
  const coverageRows = ['backend', 'frontend'].flatMap((scope) => {
    const data = metrics.coverage[scope];
    return COVERAGE_METRICS.map((metric) => {
      const value = data.summary[metric];
      return `| ${scope} | ${metric} | ${percent(value?.meanPercent ?? null)} | ${value?.observations ?? 0} | ${percent(value?.minPercent ?? null)} | ${percent(value?.maxPercent ?? null)} |`;
    });
  });
  const failureRows = metrics.stepFailures.length
    ? metrics.stepFailures.map(({ step, count, evidence }) =>
      `| ${step} | ${count} | ${evidence.map(({ runId }) => runId).join(', ')} |`)
    : ['| None observed | 0 | - |'];
  const recommendationLines = retrospective.recommendations.length
    ? retrospective.recommendations.map((recommendation) => [
      `### ${recommendation.title}`,
      '',
      `- **Status:** ${recommendation.status} — proposal only; human approval required.`,
      `- **Evidence run IDs:** ${recommendation.evidenceRunIds.join(', ')}`,
      `- **Hypothesis:** ${recommendation.hypothesis}`,
      `- **Verification:** ${recommendation.verificationMethod}`,
      '- **Owner / deadline:** required before acceptance; currently unavailable.',
      ''
    ].join('\n')).join('\n')
    : 'No recommendations generated; no observed failed steps were available as a basis.\n';
  const unavailableLines = retrospective.unavailableMetrics
    .map(({ metric, reason }) => `- **${metric}:** unavailable — ${reason}`).join('\n');
  const sourceLines = source.reports.map(({ path, runId, attempt, observedAt, timestampField, status }) =>
    `| \`${path}\` | ${runId} | ${attempt ?? 'unavailable'} | ${observedAt} (${timestampField}) | ${status} |`);
  const excludedLines = source.outOfWindowReports.length
    ? source.outOfWindowReports.map(({ path, runId, observedAt }) => `- \`${path}\` — run ${runId}, observed ${observedAt}`)
    : ['- None'];

  return [
    '# Fortnightly quality retrospective',
    '',
    `- **Window (UTC, start inclusive / end exclusive):** ${window.start} to ${window.end}`,
    `- **Window length:** ${window.days} days`,
    `- **Reports included:** ${source.reportCount}`,
    `- **Generated:** ${retrospective.generatedAt}`,
    '',
    '## Observed report outcomes',
    '',
    '| Reports | Passed | Failed | Not run |',
    '| ---: | ---: | ---: | ---: |',
    `| ${metrics.reports.total} | ${metrics.reports.passed} | ${metrics.reports.failed} | ${metrics.reports.notRun} |`,
    '',
    'Counts are report records, not deduplicated workflow IDs. Attempts and repeated IDs are preserved as reported; no retries are inferred.',
    '',
    '## Observed step failures',
    '',
    '| Step | Failure reports | Run IDs |',
    '| --- | ---: | --- |',
    ...failureRows,
    '',
    '## Measured coverage',
    '',
    '| Scope | Metric | Mean observed % | Observations | Minimum | Maximum |',
    '| --- | --- | ---: | ---: | ---: | ---: |',
    ...coverageRows,
    '',
    'Means/minima/maxima are computed only from measured source reports; unavailable measurements are not treated as zero.',
    '',
    '## Proposed recommendations',
    '',
    'Every item below is a proposal, not an accepted decision. This tool never approves proposals or changes workflows or thresholds. A human owner and deadline are required before any acceptance.',
    '',
    recommendationLines,
    '## Unavailable metrics',
    '',
    unavailableLines,
    '',
    '## Source reports',
    '',
    '| Report path | Run ID | Attempt | Observed timestamp | Outcome |',
    '| --- | --- | ---: | --- | --- |',
    ...sourceLines,
    '',
    '### Out-of-window reports excluded',
    '',
    ...excludedLines,
    '',
    '## Owner setup and limits',
    '',
    'The Quality workflow retains evidence artifacts for 14 days. Owners must download the `quality-evidence-<run-id>-<attempt>` artifacts and retain or provide the `test-result.json` files for the selected window; no artifact API, PR/issue data source, or automatic collection is configured. Run this tool with those files or a directory containing them, and supply an explicit 14-day start/end window.',
    '',
    'This report does not infer PR conversion, retry counts, false positives, human decisions/adoption, issue outcomes, or a trend baseline. Review the JSON source list and unavailable values before using any proposal.',
    ''
  ].join('\n');
}

function parseArguments(argv) {
  const options = { inputs: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!['--input', '--start', '--end', '--output-dir'].includes(flag)) {
      throw new RetrospectiveError(`Unknown option: ${flag}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new RetrospectiveError(`Missing value for ${flag}.`);
    index += 1;
    if (flag === '--input') options.inputs.push(value);
    else options[flag === '--output-dir' ? 'outputDir' : flag.slice(2)] = value;
  }
  if (options.inputs.length === 0 || !options.start || !options.end) {
    throw new RetrospectiveError('Usage: npm run m5:retrospective -- --input <file-or-directory> --start <ISO-date-time> --end <ISO-date-time> [--output-dir <directory>]');
  }
  options.outputDir ??= 'qa/test-management/retrospectives';
  return options;
}

async function main(argv) {
  const options = parseArguments(argv);
  const retrospective = await createRetrospective(options);
  const outputDir = resolve(options.outputDir);
  try {
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, 'retrospective.json'), `${JSON.stringify(retrospective, null, 2)}\n`);
    await writeFile(join(outputDir, 'retrospective.md'), formatMarkdown(retrospective));
  } catch (error) {
    throw new RetrospectiveError(`Cannot write retrospective output to ${outputDir}: ${error.message}`, 4);
  }
  console.log(`Wrote retrospective.json and retrospective.md to ${outputDir} (${retrospective.source.reportCount} reports).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = error.exitCode ?? 4;
  });
}
