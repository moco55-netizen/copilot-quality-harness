## 計画書の参照
- plan.md: **M4「Autoマージを最後に有効化」**
- 関連Skills: `06-pr-report-and-ai-review.md`、`07-merge-decision.md`

## このIssueの役割
Branch protection と Auto-merge を実装する。これなしに品質ゲートが機能しない。現状は read-only intake と quality check が動いているが、PR の最終的な自動マージまでの安全な制御が実装されていない。

## 要件

### 1. Branch Protection の設定
- 必須 Status Check を確定し、`.github/branch-protection.md` に記録する
  - 必須: `quality` (unit/build/E2E)
  - 必須: `M2 validation` (read-only triage)
  - 必須: `AI Review` (補助ゲート)
  - 必須: 人間による1件の approve
- PR が必須条件をすべて満たさない限りマージ不可にする

### 2. Auto-merge の条件検証
- Auto-merge を有効化する前に、停止条件を検証スクリプトで監視する
  - fork PR ではない
  - secret / 権限不足がない
  - critical / high リスク変更ではない
  - テスト未実施ではない
  - diff 超過していない
  - AI Review が成功している
  - 人間承認がある
  - 最新コミットが一致している

### 3. PR へのフィードバック
- Auto-merge が有効化された場合: PR comment に「Auto-merge is enabled」と明示
- 条件未達で停止した場合: PR comment に停止理由を列挙
- Workflow summary に条件チェック結果を出力

## 成果物

### コード
- `.github/branch-protection.md` - 必須 Status Check と条件の説明
- `.github/workflows/merge-decision.yml` - Auto-merge 条件検証 workflow
- `scripts/merge-decision-check.mjs` - 停止条件を検証するスクリプト

### テスト
- `scripts/merge-decision-check.test.mjs` - 検証スクリプトの unit test
  - 停止条件が正しく判定されるか
  - fork PR の検出
  - secret 不足の検出
  - リスク判定の正確性

### ドキュメント
- README に Auto-merge の有効化条件と手動対応方法を追記

## 受入条件

- [ ] Branch protection が GitHub settings で有効
- [ ] 必須 Status Check が N 個、リポジトリ設定に反映されている
- [ ] PR が停止条件を満たす場合、自動マージされない
- [ ] PR が成功条件をすべて満たす場合、自動マージされる
- [ ] 停止理由が PR comment に明示される
- [ ] Unit test で停止条件が確認できる
- [ ] `.github/branch-protection.md` に条件と根拠がすべて記載されている

## テスト範囲

- **Unit**: `scripts/merge-decision-check.test.mjs`
  - fork 判定、secret 不足、リスク判定、diff 上限など
- **Integration**: 実 Issue/PR で動作確認
  - 条件未達 PR が停止される
  - 成功条件 PR が自動マージされる
- **E2E**: なし（運用の確認）

## 高リスク注意
- Auto-merge を有効化する前に、**必ず手動テストで停止条件を確認する**
- 既存の Branch protection 設定を破壊しないこと
- secret / 権限の漏洩に注意

## 関連Issue
- Issue #2 (AI Review の必須ゲート化)
- Issue #3 (GitHub Project / Issue フロー の運用実装)
