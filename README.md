# Copilot Quality Harness 🛠️🤖

Welcome! これは「Issue 起点で AI を使った実装・テスト・PR・品質判定」のハーネスです。新人の方にも分かりやすいよう、用語・構成・運用フロー・今後の拡張案をやさしくまとめました。

---

## ざっくり 1 分説明 ⏱️
- 目的: Issue から実装→テスト→PR→品質判定までを再現可能にすること
- 方針: AI（Copilot）は「補助」役。最終判断（マージ等）は人間が行います
- 最小要素: Skills（説明書き）・Workflows（自動化）・Scripts（判定ロジック）

---

## 目次 📚
- [主要コンポーネント](#主要コンポーネント)
- [運用フロー（図）](#運用フロー)
- [よく使うスキルとワークフロー一覧](#よく使うスキルとワークフロー一覧)
- [簡単な利用手順（試用シナリオ）](#簡単な利用手順試用シナリオ)
- [FAQ / 注意点](#faq--注意点)
- [今後の拡張案](#今後の拡張案)

---

## 主要コンポーネント 🧩
- `.github/skills/` — Skill の説明ファイル（何をするか・いつ使うか・入力/出力/停止条件などを記述）
  - 例: `ai-review-implementation.md`, `07-merge-decision.md`
- `.github/workflows/` — GitHub Actions ワークフロー（PR トリガーで AI レビューを行う等）
  - 例: `ai-review.yml`
- `.github/scripts/` — 実行スクリプト（AI レビュー判定や差分スキャンなどの最小ロジック）
  - 例: `ai-review.mjs`, `merge-decision-check.mjs`
- `qa/` — テスト設計テンプレートや結果の保存先（将来的な格納先）

> Tip: Skill は「手順書（人／AIのどちらがやるか）」を明確にする役割です。実際の自動化は workflows と scripts が担当します。

---

## 運用フロー（概要） 🌊
以下は簡易フローです。Mermaid で図示しています。

```mermaid
flowchart TD
  A[Issue 作成] --> B[人が Issue を確定]
  B --> C[AI: triage / repository analysis]
  C --> D[AI: 実装ブランチ作成 / 実装 / テスト追加]
  D --> E[CI 実行: unit / integration / e2e]
  E --> F[AI Review (補助ゲート)]
  F -->|pass| G[レビュワーによる人間レビュー]
  F -->|fail| H[PR に停止理由を記載 → 修正]
  G --> I[人が最終マージ]
```

- 重要: AI Review は「補助ゲート」です。人間が最終判断（マージ）を行います。

---

## よく使うスキルとワークフロー一覧 🔎
- Skills
  - `ai-review-implementation.md` — AI レビューの契約（目的 / トリガー / 出力 / 停止条件）
  - `07-merge-decision.md` — マージ判定の手順（自動マージは行わず、停止理由を出力）
- Workflows
  - `.github/workflows/ai-review.yml` — PR イベントで AI レビューを実行し、PR にコメントを残す
  - 将来的: `pr-quality.yml`（Unit/E2E/coverage 集約）
- Scripts
  - `.github/scripts/ai-review.mjs` — PR の差分・本文をチェックして JSON を返す最小実装
  - `.github/scripts/merge-decision-check.mjs` — マージ判定補助（停止理由の生成）

---

## 簡単な利用手順（試用シナリオ） 🧪
前提: `COPILOT_GITHUB_TOKEN` が Repository Secrets に設定されていること（ワークフローが PR にコメントするために使用）

1. 新しいブランチを作成して簡単な変更（README の一行追加など）を行う
2. 必要に応じて `qa/test-design.json` や `coverage` のメタ情報を PR に含める
3. ブランチを push して PR を作成する
4. Actions の `AI Review` ワークフローが自動で実行され、PR に自動コメントが追加される
5. PR コメントの `Stop reasons` を確認し、必要なら修正して再 push
6. 全て OK ならレビュワーがレビューして人がマージする

期待: AI Review が `pass / fail / neutral` を返し、根拠（evidence）が PR コメントに記録されます。

---

## FAQ / 注意点 ❗
- Q: AI が「承認」したら自動でマージされますか？
  - A: いいえ。ここでは自動マージは行いません。AI は補助で、最終的なマージは必ず人が行います。
- Q: Fork PR でも AI Review は動きますか？
  - A: 動きますが、fork PR はリポジトリの secret を参照できないため、安全のため一部チェックをスキップし `neutral` 扱いになります。
- Q: Secrets を直接差分に含めても検出できますか？
  - A: 簡易パターンで検出する仕組みはありますが、100% ではありません。本番では専用の secret scanning を併用してください。

---

## 今後の拡張案 🚀
- AI 評価を LLM（自然言語判定）で強化し、より詳細なレビューコメントを生成
- Coverage 等の定量評価を追加し閾値判定（例: coverage >= 80%）を自動化
- Branch protection を UI で必須化して `AI Review` を必須 Status Check に追加
- PR から運用レポートを自動集計して 2 週間ごとの振り返りを生成
- Jev 等の実行環境へ接続して判定の再現性を担保

---

## お困りのとき / 連絡先 📬
- Issues に書いてください: `Project` や `AI review` に関するフィードバックを歓迎します
- （内部向け）運用ルールや Branch protection を変更する場合は、必ず担当者に通知してください

---

この README は初心者の方が迷わないように定期的に改善します。改善アイデアや不明点があれば Issue を立ててください！ ✨
