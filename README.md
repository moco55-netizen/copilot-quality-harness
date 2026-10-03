## Auto-merge と Branch protection

このリポジトリでは、Auto-merge を行わない方針に変更しました。
scripts/merge-decision-check.mjs は PR の安全判定と停止理由を機械的に判定する補助ツールとして残しますが、ワークフローやスクリプトから自動的に `gh pr merge --auto` を実行してマージする運用は採用しません。PR の最終マージは必ず人間が行ってください。

### 必須チェック

PR をマージする前に確認すべき必須チェック（人がマージ判断を行うための基準）は次のとおりです。

- `quality` Status Check が success
- `M2 validation` Status Check が success
- `AI Review` Status Check が success（補助判定）
- 少なくとも 1 件の human approval がある
- PR が Draft ではない
- Merge conflict がない
- fork PR ではない
- secret / permission の不足がない
- high / critical リスク変更ではない
- テストが実行済みで成功している
- diff が上限（500 行）を超えていない
- 最新コミットが base と一致している

これらはあくまで「人が最終判断する際に確認するチェック項目」です。自動マージは行わないため、上記の条件をすべて満たしていても、最終的なマージ操作は担当者が手動で実行してください。

### 判定スクリプト

判定スクリプト（補助ツール）は次の通りです。これは自動的なマージを実行するものではなく、マージ前の判断材料を提供します。

```bash
node scripts/merge-decision-check.mjs --pr-context ./path/to/pr-context.json
```

このスクリプトは、条件未達時に `stopReasons` を返し、PR comment と workflow summary で明示します。スクリプトは自動マージを行わず、推奨対応と停止理由を出力するだけです。

### GitHub Actions 連携

- `.github/workflows/merge-decision.yml`（存在する場合）は、判定結果を PR にコメントするなどの補助用途のみで利用してください。ワークフローから自動的にマージコマンドを実行する設定は用いないでください。

### 手動対応

Auto-merge を行わない運用のため、Auto-merge が止まった場合ではなく、判定が不合格だった場合は次の手順で対応してください。

- PR コメントの停止理由を確認し、修正を行う
- テストや設定を修正の上、PR に新規 commit を push する
- 必要に応じてレビュワーに承認を依頼する
- 条件が満たされ、運用上の判断で問題ないと判断した担当者が手動でマージする

### ブランチ保護

リポジトリ設定で `main` に対して以下を設定してください（Auto-merge は利用しない前提で、マージをヒューマンガードするための推奨設定）:

- Require pull request before merging
- Require approvals: 1
- Require status checks to pass before merging
  - `quality`
  - `M2 validation`
  - `AI Review`
- Require branches to be up to date before merging
- Dismiss stale reviews when new commits are pushed

これにより、担当者が上記の必須チェックを確認した上で手動でマージできます。