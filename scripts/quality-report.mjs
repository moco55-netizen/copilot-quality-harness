import { mkdir, writeFile } from 'node:fs/promises';

const report = {
  schemaVersion: 1,
  runId: process.env.GITHUB_RUN_ID || `local-${Date.now()}`,
  generatedAt: new Date().toISOString(),
  commands: ['npm test', 'npm run build', 'npm run test:e2e'],
  status: 'not-run',
  tests: { unit: 'not-run', api: 'not-run', e2e: 'not-run' },
  unexecuted: ['coverage threshold enforcement', 'AI review'],
  residualRisks: ['SQLite is local-only in this starter slice', 'human review remains required']
};
await mkdir('qa/test-management/reports', { recursive: true });
await writeFile('qa/test-management/reports/test-result.json', `${JSON.stringify(report, null, 2)}\n`);
console.log('Wrote qa/test-management/reports/test-result.json');
