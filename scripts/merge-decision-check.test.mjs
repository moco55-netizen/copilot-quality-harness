import { strict as assert } from 'assert';
import { validateMergeDecision, STOP_CONDITIONS, DIFF_LIMIT_LINES } from './merge-decision-check.mjs';

/**
 * Mock PR context factory
 */
function createMockPRContext(overrides = {}) {
  return {
    draft: false,
    mergeable: true,
    mergeable_state: 'clean',
    additions: 50,
    deletions: 30,
    labels: [{ name: 'risk:low' }, { name: 'ai-review-passed' }],
    reviews: [
      {
        state: 'APPROVED',
        user: { login: 'approver' },
      },
    ],
    statuses: [
      { context: 'quality', state: 'success' },
      { context: 'M2 validation', state: 'success' },
      { context: 'AI Review', state: 'success' },
    ],
    head: {
      repo: {
        owner: { login: 'moco55-netizen' },
        name: 'copilot-quality-harness',
        fork: false,
      },
    },
    base: {
      repo: {
        owner: { login: 'moco55-netizen' },
        name: 'copilot-quality-harness',
      },
    },
    ...overrides,
  };
}

/**
 * Test suite
 */
console.log('🧪 Testing merge-decision-check.mjs\n');

// Test 1: All conditions pass
{
  console.log('Test 1: すべての条件をクリアした場合、Auto-merge を有効化');
  const context = createMockPRContext();
  const result = validateMergeDecision(context);

  assert.equal(result.canMerge, true, 'canMerge should be true');
  assert.equal(result.stopReasons.length, 0, 'stopReasons should be empty');
  console.log('✓ PASS\n');
}

// Test 2: Fork PR detected
{
  console.log('Test 2: Fork PR の検出');
  const context = createMockPRContext({
    head: {
      repo: {
        owner: { login: 'external-contributor' },
        name: 'copilot-quality-harness',
        fork: true,
      },
    },
  });
  const result = validateMergeDecision(context);

  assert.equal(result.canMerge, false, 'canMerge should be false');
  assert(
    result.stopReasons.includes(STOP_CONDITIONS.FORK_PR_DETECTED),
    'Should include fork-pr-detected reason'
  );
  console.log('✓ PASS\n');
}

// Test 3: Draft PR
{
  console.log('Test 3: Draft PR は自動マージできない');
  const context = createMockPRContext({ draft: true });
  const result = validateMergeDecision(context);

  assert.equal(result.canMerge, false, 'canMerge should be false');
  assert(
    result.stopReasons.includes(STOP_CONDITIONS.DRAFT_PULL_REQUEST),
    'Should include draft-pull-request reason'
  );
  console.log('✓ PASS\n');
}

// Test 4: Merge conflict
{
  console.log('Test 4: Merge conflict がある場合は停止');
  const context = createMockPRContext({ mergeable: false });
  const result = validateMergeDecision(context);

  assert.equal(result.canMerge, false, 'canMerge should be false');
  assert(
    result.stopReasons.includes(STOP_CONDITIONS.HAS_CONFLICTS),
    'Should include has-conflicts reason'
  );
  console.log('✓ PASS\n');
}

// Test 5: Status check failed
{
  console.log('Test 5: Status check 失敗で停止');
  const context = createMockPRContext({
    statuses: [
      { context: 'quality', state: 'failure' },
      { context: 'M2 validation', state: 'success' },
      { context: 'AI Review', state: 'success' },
    ],
  });
  const result = validateMergeDecision(context);

  assert.equal(result.canMerge, false, 'canMerge should be false');
  assert(
    result.stopReasons.includes(STOP_CONDITIONS.TEST_FAILED),
    'Should include test-failed reason'
  );
  console.log('✓ PASS\n');
}

// Test 6: Missing status check
{
  console.log('Test 6: Status check がまだ実行されていない場合は停止');
  const context = createMockPRContext({
    statuses: [
      { context: 'quality', state: 'success' },
      // missing AI Review
    ],
  });
  const result = validateMergeDecision(context);

  assert.equal(result.canMerge, false, 'canMerge should be false');
  assert(
    result.stopReasons.includes(STOP_CONDITIONS.TEST_NOT_EXECUTED),
    'Should include test-not-executed reason'
  );
  console.log('✓ PASS\n');
}

// Test 7: AI Review failed
{
  console.log('Test 7: AI Review 失敗で停止');
  const context = createMockPRContext({
    labels: [{ name: 'risk:low' }, { name: 'ai-review-failed' }],
  });
  const result = validateMergeDecision(context);

  assert.equal(result.canMerge, false, 'canMerge should be false');
  assert(
    result.stopReasons.includes(STOP_CONDITIONS.AI_REVIEW_FAILED),
    'Should include ai-review-failed reason'
  );
  console.log('✓ PASS\n');
}

// Test 8: High risk change
{
  console.log('Test 8: High リスク判定で停止');
  const context = createMockPRContext({
    labels: [{ name: 'risk:high' }, { name: 'ai-review-passed' }],
  });
  const result = validateMergeDecision(context);

  assert.equal(result.canMerge, false, 'canMerge should be false');
  assert(
    result.stopReasons.includes(STOP_CONDITIONS.HIGH_RISK_CHANGE),
    'Should include high-risk-change reason'
  );
  console.log('✓ PASS\n');
}

// Test 9: Critical risk change
{
  console.log('Test 9: Critical リスク判定で停止');
  const context = createMockPRContext({
    labels: [{ name: 'risk:critical' }, { name: 'ai-review-passed' }],
  });
  const result = validateMergeDecision(context);

  assert.equal(result.canMerge, false, 'canMerge should be false');
  assert(
    result.stopReasons.includes(STOP_CONDITIONS.HIGH_RISK_CHANGE),
    'Should include high-risk-change reason'
  );
  console.log('✓ PASS\n');
}

// Test 10: Diff exceeds limit
{
  console.log('Test 10: 差分が上限を超えた場合は停止');
  const context = createMockPRContext({
    additions: 400,
    deletions: 150,
  });
  const result = validateMergeDecision(context);

  assert.equal(result.canMerge, false, 'canMerge should be false');
  assert(
    result.stopReasons.includes(STOP_CONDITIONS.DIFF_EXCEEDS_LIMIT),
    'Should include diff-exceeds-limit reason'
  );
  console.log('✓ PASS\n');
}

// Test 11: Diff within limit
{
  console.log('Test 11: 差分が上限以下の場合は許可');
  const context = createMockPRContext({
    additions: 300,
    deletions: 100,
  });
  const result = validateMergeDecision(context);

  assert.equal(result.canMerge, true, 'canMerge should be true');
  console.log('✓ PASS\n');
}

// Test 12: No human approval
{
  console.log('Test 12: 人間承認がない場合は停止');
  const context = createMockPRContext({
    reviews: [],
  });
  const result = validateMergeDecision(context);

  assert.equal(result.canMerge, false, 'canMerge should be false');
  assert(
    result.stopReasons.includes(STOP_CONDITIONS.NO_HUMAN_APPROVAL),
    'Should include no-human-approval reason'
  );
  console.log('✓ PASS\n');
}

// Test 13: Multiple approvals
{
  console.log('Test 13: 複数の承認がある場合も許可');
  const context = createMockPRContext({
    reviews: [
      { state: 'APPROVED', user: { login: 'reviewer1' } },
      { state: 'APPROVED', user: { login: 'reviewer2' } },
      { state: 'CHANGES_REQUESTED', user: { login: 'reviewer3' } },
    ],
  });
  const result = validateMergeDecision(context);

  assert.equal(result.canMerge, true, 'canMerge should be true');
  console.log('✓ PASS\n');
}

// Test 14: Commit mismatch (behind)
{
  console.log('Test 14: PR が main に追従していない場合は停止');
  const context = createMockPRContext({
    mergeable_state: 'behind',
  });
  const result = validateMergeDecision(context);

  assert.equal(result.canMerge, false, 'canMerge should be false');
  assert(
    result.stopReasons.includes(STOP_CONDITIONS.COMMIT_MISMATCH),
    'Should include commit-mismatch reason'
  );
  console.log('✓ PASS\n');
}

// Test 15: Risk label missing
{
  console.log('Test 15: リスク判定ラベルが見つからない場合は停止');
  const context = createMockPRContext({
    labels: [{ name: 'ai-review-passed' }],
  });
  const result = validateMergeDecision(context);

  assert.equal(result.canMerge, false, 'canMerge should be false');
  assert(
    result.stopReasons.includes(STOP_CONDITIONS.TEST_NOT_EXECUTED),
    'Should include test-not-executed reason (missing risk label)'
  );
  console.log('✓ PASS\n');
}

// Test 16: AI Review passed label missing
{
  console.log('Test 16: AI Review 成功ラベルが見つからない場合は停止');
  const context = createMockPRContext({
    labels: [{ name: 'risk:low' }],
  });
  const result = validateMergeDecision(context);

  assert.equal(result.canMerge, false, 'canMerge should be false');
  assert(
    result.stopReasons.includes(STOP_CONDITIONS.TEST_NOT_EXECUTED),
    'Should include test-not-executed reason (missing ai-review-passed)'
  );
  console.log('✓ PASS\n');
}

// Test 17: Custom diff limit
{
  console.log('Test 17: カスタム差分上限でテスト');
  const context = createMockPRContext({
    additions: 250,
    deletions: 150,
  });
  const result = validateMergeDecision(context, { diffLimit: 300 });

  assert.equal(result.canMerge, false, 'canMerge should be false with diff limit 300');
  const result2 = validateMergeDecision(context, { diffLimit: 500 });
  assert.equal(result2.canMerge, true, 'canMerge should be true with diff limit 500');
  console.log('✓ PASS\n');
}

// Test 18: Repo mismatch
{
  console.log('Test 18: 異なるリポジトリからの PR は停止');
  const context = createMockPRContext({
    head: {
      repo: {
        owner: { login: 'moco55-netizen' },
        name: 'other-repo',
        fork: false,
      },
    },
    base: {
      repo: {
        owner: { login: 'moco55-netizen' },
        name: 'copilot-quality-harness',
      },
    },
  });
  const result = validateMergeDecision(context);

  assert.equal(result.canMerge, false, 'canMerge should be false');
  assert(
    result.stopReasons.includes(STOP_CONDITIONS.FORK_PR_DETECTED),
    'Should include fork-pr-detected reason'
  );
  console.log('✓ PASS\n');
}

// Test 19: Multiple stop reasons
{
  console.log('Test 19: 複数の停止理由がある場合');
  const context = createMockPRContext({
    draft: true,
    mergeable: false,
    reviews: [],
  });
  const result = validateMergeDecision(context);

  assert.equal(result.canMerge, false, 'canMerge should be false');
  assert(result.stopReasons.length >= 2, 'Should have multiple stop reasons');
  console.log(`   複数の停止理由: ${result.stopReasons.join(', ')}`);
  console.log('✓ PASS\n');
}

console.log('✅ すべてのテストが成功しました！');
console.log(`テスト数: 19個`);
