# Copilot Quality Harness

最小の React + Node.js + SQLite アプリを題材に、Issue 起点の AI 開発を決定論的なテストと人間レビューで支えるためのハーネスです。M0〜M2では、入力契約・Skills・決定論的なIssue→解析→テスト設計検証・テスト・CIの土台を提供します。

## Quick start

```bash
npm install
npm run dev
```

ブラウザで <http://localhost:5173> を開きます。APIは `http://localhost:3000` です。

```bash
npm test                 # frontend unit + backend API
npm run build            # frontend production build
npm run test:e2e         # Playwright (必要なら npx playwright install)
npm run quality:report  # qa/test-management/reports/test-result.json を生成
npm run test:m2          # M2 CLIの決定論的テスト
npm run m2:validate      # fixtures/m2/valid-issue.jsonからM2成果物を生成
```

## Quality contract

`.github/skills/00-common-contract.md` をすべてのSkillの共通契約とし、Issue入力、影響範囲、テスト観点、実測結果、残存リスクを分離して記録します。AIの出力は提案であり、CIの実測値と人間の承認を代替しません。高リスク変更、入力不足、テスト未実施、権限不足では停止します。

最初のスライスでは、Issueテンプレート、PRテンプレート、CI（unit/API/build/E2E）、テスト結果JSONを提供します。Auto-merge、AIレビューの承認扱い、Branch protectionの変更は安全設計のため後続フェーズです。

## Repository map

- `frontend/`: React/Vite UIとcomponent test
- `backend/`: Express API、SQLite schema、API test
- `e2e/`: Playwright主要ユーザーフロー
- `.github/skills/`: 共通契約と優先Skills
- `.github/workflows/`: 決定論的CI
- `qa/test-management/`: 観点カタログ、スキーマ、実行レポート

## M2 validation contract

`scripts/m2-validation.mjs` はネットワークアクセスやソースツリーへの書き込みを行わず、`--issue`（Issue契約JSON）、`--catalog`（観点カタログYAML）、`--root`（解析対象ルート）、`--output`（成果物出力先）を受け取ります。出力契約は `qa/test-management/schemas/m2-validation.schema.json` で定義し、`status`、`issue`、`analysis`（候補パス、分類、参照検証）、`testDesign`（カタログ全項目と受入条件）を含む決定論的JSONです。

終了コードは `0=成功`、`2=契約/参照不正`、`3=安全停止（high/critical、不足情報、実行不許可）`、`4=入出力エラー` です。`targetPaths` はリポジトリ相対パスのみ許可され、存在しない参照や親ディレクトリ参照は停止します。
