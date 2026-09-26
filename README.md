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

`scripts/m2-validation.mjs` は `--issue`（ローカルIssue契約JSON）または同一リポジトリから取得した `--github-issue`、`--catalog`（観点カタログYAML）、`--root`（解析対象ルート）、`--output`（成果物出力先）を受け取ります。GitHub Issueモードでは要求番号、API/HTML URL、Issue種別、open状態を検証し、本文は決められた見出しからだけ抽出します。本文をプロンプトや実行コードとして扱う処理はありません。出力契約は `qa/test-management/schemas/m2-validation.schema.json` で定義し、`sourceTrust`、`analysis`、`testDesign`、実装を許可しない人間レビュー用`handoff`を含む決定論的JSONです。

終了コードは `0=人間レビュー可能`、`2=契約/参照不正`、`3=安全停止（high/critical、不足情報、制限超過、禁止範囲）`、`4=入出力エラー` です。`targetPaths` はリポジトリ相対パスのみ許可され、存在しない参照や親ディレクトリ参照は停止します。Issue本文・受入条件・テスト観点・参照ファイル数には上限を設けています。

### Manual GitHub Actions intake

1. `.github/workflows/m2-issue-intake.yml` の **Run workflow** を既定ブランチで手動実行し、このリポジトリで開いているIssue番号を入力します。既定ブランチ以外からの実行は拒否されます。
2. Issueフォームの `受入条件`、`影響範囲`（Frontend/Backend/API/DB/Infra/Docs）、`リスク`（low/medium/high/critical）、`テスト要求`を記入してください。高/critical、不足情報、認証・個人情報・決済・破壊的DB操作の記述、入力上限超過は停止し、可能な場合は理由をIssueコメントに残します。
3. 成功・停止いずれも14日保持のJSON Artifactとして記録します。成功時も提案するのは `work/issue-N` 形式のブランチ名だけで、ブランチ作成・実装・テスト実行・PR作成は行わず、人間のレビューと別途の明示的承認が必要です。

Workflow権限は `contents: read` とIssueへの説明コメントに必要な `issues: write` のみです。リポジトリまたはOrganizationのActions設定で、`GITHUB_TOKEN`によるIssueコメント書き込みを許可してください。追加Secrets、`COPILOT_GITHUB_TOKEN`、GitHub App、外部モデル呼び出しは不要です。本文は同一リポジトリのGitHub Issues APIから取得し、原文はArtifactに保存しません。
