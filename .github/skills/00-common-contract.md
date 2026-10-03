# Common Skill Contract (わかりやすい版) 📝

## ✨ 目的 (Purpose)
AI（Copilot 等）が Issue を起点に実装・テスト・PR・報告を行うときの「共通ルール」と安全境界を定義します。
- AI は自動化の「手段」であり、最終的な責務（承認／マージ）は人間が負います。

## ⚡ トリガー (Trigger)
次のタイミングでこの Skill を呼び出します（または読む）:
- Issue または PR が作成／更新されたとき
- Workflow dispatch（手動開始）
- 前段 Skill の出力が揃ったとき

## 🧾 必要な入力 (Required inputs)
- Issue / PR 番号と本文（受入条件、対象範囲、severity）
- 対象ブランチ名と差分（変更ファイルの一覧）
- 前段 Skill の成果物（ある場合）
- 品質基準・テスト観点カタログ（どこに保存するか明示）

> 例: `issue-contract.json` を入力として受け取る、など。

## 🔧 手順（Procedure）
1. 入力を読み込み、対象パスと差分を特定する。
2. 受入条件や高リスク項目（認証・DB マイグレーション・Pii 等）があるか確認する。
3. 許可された範囲だけを変更し、決定論的に検証（lint/build/test）を実行する。
4. 実施/未実施、残存リスク、理由を成果物に記録する。

## 📦 出力の契約 (Output contract)
出力ファイル（例: `artifact/skill-result.json`）は以下を含むこと:
- schemaVersion
- runId
- inputs の参照（Issue/PR 番号）
- 実施済み項目 / 未実施項目
- 残存リスク（summary）
- stopReasons（停止した理由の一覧）

テンプレート例（JSON）:
```json
{
  "schemaVersion": "1.0",
  "runId": "2026-10-03-01",
  "pr": 12,
  "performed": ["repo-analysis","unit-tests"],
  "skipped": ["e2e-tests"],
  "stopReasons": ["missing test-design.json"],
  "riskSummary": "no high risk found"
}
```

## ⛔ 停止条件 (Stop conditions)
次のいずれかが見つかったら、処理を中断して人間に引き渡します:
- 受入条件・対象範囲が不明確
- `critical` / `high` リスク（認証・個人情報・決済・DB 破壊的変更）
- 許可パス外の変更（想定外ファイルの編集）
- テスト失敗や build エラー
- 権限（secret / permission）不足

## 🚫 やってはいけないこと (Do not)
- 受入条件を勝手に補完して進めない
- 秘密情報をログや出力に残さない
- テストの成功を偽装しない
- 人間の承認なしにマージやブランチ保護を変更しない

## 🔍 検証 (Verification)
- `git diff --check` を実行して whitespace/潜在的な衝突を検出
- 指定のテスト（unit/integration）を実行・結果を検証
- 出力ファイルがスキーマに合致しているかを JSON Schema でチェック

## 🧪 実例: 簡単な実行フロー（擬似コマンド）
1. issue-contract.json を受け取る
2. 対象ファイル一覧を作る
3. run unit tests: `npm test -- --runInBand`
4. 作成した `skill-result.json` を `artifact/` に保存

## ✅ チェックリスト（実行時）
- [ ] Issue / PR 番号が入力にある
- [ ] 変更ファイル一覧を保存した
- [ ] 重大リスクがないか確認した
- [ ] 必要なテストを実行した（ログを保存）
- [ ] 出力スキーマを満たしている

## 🤝 運用メモ（初心者向け）
- Skill は「やること」と「やらないこと」を明確にする説明書です。まず Skill を読めば次に何をするかが分かるようにしてください。
- スクリプトは PR のコードを実行しない（危険） — 必ず patch/差分を読むだけに留めるか、checkout する場合は base のみを使って安全を確保します。
- エラーや不整合は `stopReasons` に必ず記載して人間の判断を仰いでください。

---

このファイルは初心者にも読みやすいよう、用語の注釈とチェックリストを追加しました。追加したい具体例や会社内の標準フォーマットがあれば追記します。