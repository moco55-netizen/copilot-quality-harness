## Auto-merge と Branch protection

このリポジトリでは、Auto-merge を有効化する前に、`scripts/merge-decision-check.mjs` による安全判定を通す設計にしています。

### 必須チェック

PR は次の条件をすべて満たした場合のみ Auto-merge 可能です。

- `quality` Status Check が success
- `M2 validation` Status Check が success
- `AI Review` Status Check が success
- 少なくとも 1 件の human approval がある
- PR が Draft ではない
- Merge conflict がない
- fork PR ではない
- secret / permission の不足がない
- high / critical リスク変更ではない
- テストが実行済みで成功している
- diff が上限（500 行）を超えていない
- AI review が成功している
- 最新コミットが base と一致している

### 判定スクリプト

```bash
node scripts/merge-decision-check.mjs --pr-context ./path/to/pr-context.json
```

このスクリプトは、条件未達時に `stopReasons` を返し、PR comment と workflow summary で明示します。

### GitHub Actions 連携

- `.github/workflows/merge-decision.yml`
- `.github/branch-protection.md`

上記を組み合わせて、PR が安全条件を満たした時だけ `gh pr merge --auto` を実行します。

### 手動対応

Auto-merge が止まった場合は、PR コメントの停止理由と `.github/branch-protection.md` の対処手順に従ってください。

- fork PR では手動 cherry-pick
- secret / permissions 不足は Actions 画面で確認
- high / critical リスクの変更は人間による手動レビュー
- テスト失敗時はテスト修正後に再 push
- AI Review 指摘がある場合は修正と再検証
- 人間承認がない場合は reviewer の承認を依頼

### ブランチ保護

リポジトリ設定で `main` に対して以下を設定してください。

- Require pull request before merging
- Require approvals: 1
- Require status checks to pass before merging
  - `quality`
  - `M2 validation`
  - `AI Review`
- Require branches to be up to date before merging
- Dismiss stale reviews when new commits are pushed

これにより、条件未達時にはマージ不能であり、Auto-merge が安全に止まるようになります。
