#!/usr/bin/env node

/**
 * merge-decision-check.mjs
 *
 * Auto-merge の条件を検証し、安全にマージ可能かを判定します。
 *
 * 使用方法:
 *   node scripts/merge-decision-check.mjs --pr-context <context-json>
 *   node scripts/merge-decision-check.mjs --github-token <token> --repo <owner/repo> --pr <number>
 *
 * 終了コード:
 *   0: 成功 - Auto-merge を有効化
 *   1: 警告 - 条件不足だが修正可能
 *   2: エラー - スクリプト引数エラー
 *   3: 停止 - 安全上の理由で停止（fork、secret、リスク高）
 *   4: 失敗 - 内部エラー
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const STOP_CONDITIONS = {
  FORK_PR_DETECTED: 'fork-pr-detected',
  SECRETS_MISSING: 'secrets-missing',
  INSUFFICIENT_PERMISSIONS: 'insufficient-permissions',
  HIGH_RISK_CHANGE: 'high-risk-change',
  TEST_NOT_EXECUTED: 'test-not-executed',
  TEST_FAILED: 'test-failed',
  DIFF_EXCEEDS_LIMIT: 'diff-exceeds-limit',
  AI_REVIEW_FAILED: 'ai-review-failed',
  NO_HUMAN_APPROVAL: 'no-human-approval',
  COMMIT_MISMATCH: 'commit-mismatch',
  DRAFT_PULL_REQUEST: 'draft-pull-request',
  HAS_CONFLICTS: 'has-conflicts',
};

const DIFF_LIMIT_LINES = 500;

/**
 * Check if PR is from a fork
 */
function checkForkPR(prContext) {
  const { head, base } = prContext;
  
  if (head.repo === null || head.repo.fork) {
    return {
      passed: false,
      condition: STOP_CONDITIONS.FORK_PR_DETECTED,
      message: 'Fork からの PR は自動マージできません。所有者による手動 cherry-pick が必要です。',
    };
  }

  if (head.repo.owner.login !== base.repo.owner.login) {
    return {
      passed: false,
      condition: STOP_CONDITIONS.FORK_PR_DETECTED,
      message: `異なるリポジトリからの PR です。[${head.repo.owner.login}/${head.repo.name}] → [${base.repo.owner.login}/${base.repo.name}]`,
    };
  }

  return {
    passed: true,
    condition: 'fork-check-passed',
    message: 'Fork PR ではありません。',
  };
}

/**
 * Check if draft status
 */
function checkDraftStatus(prContext) {
  if (prContext.draft) {
    return {
      passed: false,
      condition: STOP_CONDITIONS.DRAFT_PULL_REQUEST,
      message: 'Draft PR は自動マージできません。Ready for review に変更してください。',
    };
  }

  return {
    passed: true,
    condition: 'draft-check-passed',
    message: 'Draft ではありません。',
  };
}

/**
 * Check if PR has conflicts
 */
function checkConflicts(prContext) {
  if (prContext.mergeable === false) {
    return {
      passed: false,
      condition: STOP_CONDITIONS.HAS_CONFLICTS,
      message: 'PR に Merge conflict があります。解決してから再度 push してください。',
    };
  }

  return {
    passed: true,
    condition: 'conflict-check-passed',
    message: 'Merge conflict はありません。',
  };
}

/**
 * Check human approval
 */
function checkHumanApproval(prContext, minApprovals = 1) {
  const approvals = prContext.reviews?.filter((r) => r.state === 'APPROVED') || [];

  if (approvals.length < minApprovals) {
    return {
      passed: false,
      condition: STOP_CONDITIONS.NO_HUMAN_APPROVAL,
      message: `人間によるレビュー承認が不足しています。必須: ${minApprovals}件、現在: ${approvals.length}件`,
    };
  }

  return {
    passed: true,
    condition: 'approval-check-passed',
    message: `${approvals.length}件の承認が確認されました。`,
  };
}

/**
 * Check required status checks
 */
function checkStatusChecks(prContext, requiredChecks = ['quality', 'M2 validation', 'AI Review']) {
  const statusChecks = prContext.statuses || [];
  const failedChecks = [];
  const missingChecks = [];

  for (const requiredCheck of requiredChecks) {
    const check = statusChecks.find((s) => s.context === requiredCheck);

    if (!check) {
      missingChecks.push(requiredCheck);
    } else if (check.state !== 'success') {
      failedChecks.push(`${requiredCheck}: ${check.state}`);
    }
  }

  if (failedChecks.length > 0) {
    return {
      passed: false,
      condition: STOP_CONDITIONS.TEST_FAILED,
      message: `Status checks が失敗しています: ${failedChecks.join(', ')}`,
    };
  }

  if (missingChecks.length > 0) {
    return {
      passed: false,
      condition: STOP_CONDITIONS.TEST_NOT_EXECUTED,
      message: `Status checks がまだ実行されていません: ${missingChecks.join(', ')}`,
    };
  }

  return {
    passed: true,
    condition: 'status-check-passed',
    message: `すべての必須 Status Check が成功しています。`,
  };
}

/**
 * Check AI Review result
 */
function checkAIReviewResult(prContext) {
  // AI Review は comments で確認。特定ラベルを付与することで判定
  const labels = prContext.labels || [];
  const hasAIReviewFailed = labels.some((l) => l.name === 'ai-review-failed');
  const hasAIReviewPassed = labels.some((l) => l.name === 'ai-review-passed');

  if (hasAIReviewFailed) {
    return {
      passed: false,
      condition: STOP_CONDITIONS.AI_REVIEW_FAILED,
      message: 'AI Review が失敗しました。PR コメントで AI の指摘を確認し、修正してください。',
    };
  }

  if (!hasAIReviewPassed) {
    return {
      passed: false,
      condition: STOP_CONDITIONS.TEST_NOT_EXECUTED,
      message: 'AI Review がまだ実行されていません。',
    };
  }

  return {
    passed: true,
    condition: 'ai-review-check-passed',
    message: 'AI Review が成功しました。',
  };
}

/**
 * Check if risk is acceptable (not high/critical)
 */
function checkRiskLevel(prContext) {
  const labels = prContext.labels || [];
  const riskLabels = labels.filter((l) => l.name.startsWith('risk:'));

  if (riskLabels.length === 0) {
    return {
      passed: false,
      condition: STOP_CONDITIONS.TEST_NOT_EXECUTED,
      message: 'リスク判定ラベルが見つかりません。Issue triage を実行してください。',
    };
  }

  const riskLevel = riskLabels[0].name.split(':')[1]; // e.g. 'risk:high' -> 'high'

  if (['high', 'critical'].includes(riskLevel)) {
    return {
      passed: false,
      condition: STOP_CONDITIONS.HIGH_RISK_CHANGE,
      message: `High/Critical リスク変更は自動マージできません。リスク: ${riskLevel}。リポジトリ管理者による手動マージが必須です。`,
    };
  }

  return {
    passed: true,
    condition: 'risk-check-passed',
    message: `リスク判定が ${riskLevel} で許容範囲です。`,
  };
}

/**
 * Check diff size
 */
function checkDiffSize(prContext, limitLines = DIFF_LIMIT_LINES) {
  const changedLines = prContext.additions + prContext.deletions;

  if (changedLines > limitLines) {
    return {
      passed: false,
      condition: STOP_CONDITIONS.DIFF_EXCEEDS_LIMIT,
      message: `差分が上限を超えています。現在: ${changedLines}行、上限: ${limitLines}行。差分を分割してください。`,
    };
  }

  return {
    passed: true,
    condition: 'diff-check-passed',
    message: `差分サイズが許容範囲です。${changedLines}行。`,
  };
}

/**
 * Check commit match (head commit is latest)
 */
function checkCommitMatch(prContext) {
  const { head, base } = prContext;

  // TODO: GitHub API で最新コミットを取得して比較
  // 現在は、mergeable_state から推測
  if (prContext.mergeable_state === 'behind') {
    return {
      passed: false,
      condition: STOP_CONDITIONS.COMMIT_MISMATCH,
      message: `PR が main ブランチの最新コミットに追従していません。最新にリベースしてください。`,
    };
  }

  return {
    passed: true,
    condition: 'commit-check-passed',
    message: '最新コミットが一致しています。',
  };
}

/**
 * Validate all conditions and return decision
 */
export function validateMergeDecision(prContext, options = {}) {
  const {
    minApprovals = 1,
    requiredStatusChecks = ['quality', 'M2 validation', 'AI Review'],
    diffLimit = DIFF_LIMIT_LINES,
  } = options;

  const checks = [
    { name: 'Fork PR チェック', check: () => checkForkPR(prContext) },
    { name: 'Draft ステータスチェック', check: () => checkDraftStatus(prContext) },
    { name: 'Merge Conflict チェック', check: () => checkConflicts(prContext) },
    { name: 'Status Checks チェック', check: () => checkStatusChecks(prContext, requiredStatusChecks) },
    { name: 'AI Review チェック', check: () => checkAIReviewResult(prContext) },
    { name: 'リスク判定チェック', check: () => checkRiskLevel(prContext) },
    { name: '差分サイズチェック', check: () => checkDiffSize(prContext, diffLimit) },
    { name: '人間承認チェック', check: () => checkHumanApproval(prContext, minApprovals) },
    { name: 'コミット一致チェック', check: () => checkCommitMatch(prContext) },
  ];

  const results = {
    canMerge: true,
    conditions: [],
    stopReasons: [],
    warnings: [],
  };

  for (const { name, check } of checks) {
    try {
      const result = check();
      results.conditions.push({
        name,
        ...result,
      });

      if (!result.passed) {
        results.canMerge = false;
        results.stopReasons.push(result.condition);
      }
    } catch (error) {
      results.canMerge = false;
      results.warnings.push(`${name} でエラーが発生しました: ${error.message}`);
    }
  }

  return results;
}

/**
 * Format result for PR comment
 */
export function formatMergeDecisionComment(result) {
  let comment = '';

  if (result.canMerge) {
    comment += '## ✅ Auto-merge が有効化されました\n\n';
    comment += 'このPRはすべての品質ゲートを通過し、自動マージの条件を満たしています。\n\n';
  } else {
    comment += '## ⚠️ Auto-merge は停止しました\n\n';
    comment += '以下の理由により、自動マージできません。各項目を確認し、修正してください。\n\n';
  }

  comment += '### チェック結果\n\n';
  for (const condition of result.conditions) {
    const icon = condition.passed ? '✅' : '❌';
    comment += `${icon} **${condition.name}**\n`;
    comment += `   ${condition.message}\n\n`;
  }

  if (result.stopReasons.length > 0) {
    comment += '### 停止理由\n\n';
    comment += result.stopReasons.map((r) => `- \`${r}\``).join('\n');
    comment += '\n\n';
  }

  if (result.warnings.length > 0) {
    comment += '### ⚠️ 警告\n\n';
    comment += result.warnings.map((w) => `- ${w}`).join('\n');
    comment += '\n\n';
  }

  comment += '### 対応方法\n\n';
  if (result.canMerge) {
    comment +=
      '条件をすべて満たしています。GitHub は自動的にこの PR をマージします（数秒〜数分待機）。\n';
  } else {
    comment += '1. 上記のチェック項目から失敗した項目を確認\n';
    comment += '2. `.github/branch-protection.md` で停止理由別の対応方法を参照\n';
    comment += '3. 修正後、PR に新規 commit を push します。Workflow が再度実行されます\n';
  }

  return comment;
}

/**
 * Main CLI
 */
async function main() {
  const args = process.argv.slice(2);
  let prContext = null;

  // Parse arguments
  if (args.includes('--pr-context')) {
    const idx = args.indexOf('--pr-context');
    const filePath = args[idx + 1];
    if (!filePath || !fs.existsSync(filePath)) {
      console.error(
        `❌ Error: --pr-context の値が不正です: ${filePath}`
      );
      process.exit(2);
    }
    prContext = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  if (!prContext) {
    console.error('❌ Error: --pr-context が必須です。');
    console.error('使用方法: node scripts/merge-decision-check.mjs --pr-context <file.json>');
    process.exit(2);
  }

  // Validate
  const result = validateMergeDecision(prContext);

  // Output
  console.log(JSON.stringify(result, null, 2));

  // Format and output comment (for debugging)
  const comment = formatMergeDecisionComment(result);
  console.log('\n--- PR Comment ---\n');
  console.log(comment);

  // Exit code
  process.exit(result.canMerge ? 0 : 3);
}

// Export for testing
export { STOP_CONDITIONS, DIFF_LIMIT_LINES };

// CLI execution
if (process.argv[1].endsWith('merge-decision-check.mjs')) {
  main().catch((error) => {
    console.error('❌ Internal error:', error);
    process.exit(4);
  });
}
