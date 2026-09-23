# Issue起点AI開発・テスト自動化の実装計画

## 推奨リポジトリ名

**推奨:** `cocomomojo/copilot-quality-harness`

Issueから実装・テスト・PR・品質判定までを再現可能な手順（ハーネス）として整備する目的を表し、対象アプリ自体の名前に依存しないため、複数のReact/Node.js/DBプロジェクトへ展開しやすい。

候補:

- `cocomomojo/ai-dev-quality-pipeline`: 開発から品質ゲートまでの自動化を強調
- `cocomomojo/copilot-engineering-workflow`: Copilot中心の開発フローを強調
- `cocomomojo/deterministic-ai-testing`: 決定論的なテスト観点を強調

以下では、推奨名を仮のリポジトリ名として扱う。実装開始時にGitHub上の空リポジトリ名と一致させる。

## 今回の成果物

今回は本ファイル（`plan.md`）の作成までとし、リポジトリの実装・Workflow変更・テスト実行・コミットは行わない。

## 問題と提案アプローチ

GitHub Projectsで管理するIssueを起点に、Copilotエージェントによるリポジトリ解析、実装、テスト設計・実装、Unit/E2E実行、PR作成、品質レポート生成までを新規リポジトリへ段階的に構築する。最初から既存アプリ固有の実装を前提にせず、Issueテンプレート、Issue triage、Workflow、Playwright E2E、PRテスト計画生成資産をこのリポジトリの標準部品として定義し、最小構成では「AIが候補を作る」「決定論的なCIが検証する」「人が最終責任を持つ」を分離する。

Autoマージは、必須CI成功・AIレビュー成功・人間の承認1件を必須条件とし、権限や失敗時の状態を曖昧にしない。AIのテスト判断は正本にせず、テスト観点、未実施項目、残存リスク、判断根拠をPRとArtifactに残す。

この計画の中心は「AIに全部を任せること」ではなく、Issueの入力品質、判断基準、テスト観点、停止条件を明文化し、AIが同じ手順を繰り返せるハーネスを作ることである。AIはテスト作業・一次判定・候補生成を担当できるが、品質への最終責任、リスク受容、リリース可否は人間が担う。

## 参考情報から引き継ぐ原則

### AI時代のテストマネジメント

- AIは仕様書からテストケースを生成し、テストを実行できるが、品質への責任や最終判断は持たない。
- 口頭・経験・朝会で共有されていた暗黙知を、AIが読める文書へ変換する。対象スコープ、品質特性、リスク分析の根拠、テストレベル配分、過去障害、ユーザー期待値を入力に含める。
- テスト計画、設計、実装、実行、一次判定、レポート、最終判定ごとにAIと人間の責務を分ける。
- AIレポートには、実施項目だけでなく、検証しなかった項目、スキップ理由、判断に迷った点、残存リスク、人的判断が必要な点を必ず含める。
- AIの提案を人が評価し、見逃し不具合・本番障害・誤判定を判断基準とテスト計画へ反映する改善サイクルを持つ。

### 決定論的なテスト観点

- 変更種別と影響範囲から、必須のテスト観点を機械的に選べる「テスト観点カタログ」を作る。
- 例えば認証・認可、正常系、境界値、入力不正、エラー処理、データ整合性、既存回帰、API契約、UI表示、アクセシビリティ、主要ユーザーフローを、変更領域ごとのチェック項目として定義する。
- AIの自由な発想だけでテスト範囲を決めず、カタログの必須観点を消化した上で、追加提案を別枠にする。
- テスト設計には「何を確認するか」だけでなく「なぜこの観点を選んだか」「なぜ選ばなかったか」を残す。LLMは後から理由を聞かれても、記録がなければ実際の設計意図ではなく後付けの説明を生成するためである。

### AIレビューと人間レビュー

- AI承認を人間レビューの代替にしない。AIレビューは機械的な観点漏れ、規約違反、テスト不足、影響範囲の見落としを検出する補助ゲートとする。
- 人間は、要求の妥当性、プロダクトリスク、探索的テスト、残存リスクの受容、リリース判断を担う。
- Autoマージは「CI成功」「AIレビュー成功」「人間の承認1件」をすべて満たした場合だけ許可する。

### ハーネスエンジニアリング

- エージェントのプロンプトだけに頼らず、Skills、入力スキーマ、許可ツール、許可パス、検証スクリプト、出力スキーマ、再実行条件を固定する。
- AIが行う作業を、リポジトリ解析、実装、テスト設計、テスト実装、テスト実行、報告の小さなステップに分け、各ステップの成果物を次のステップの入力にする。
- 反復可能な処理は将来スクリプト化し、GitHub Appの手動実行やWorkflow dispatchから呼び出せる形にする。一旦Jevは使わないが、Jevへ置き換え可能な境界を保つ。

## 事前に作成するGitHub Copilot Skills instructions案

実装を開始する前に、`.github/skills/` 配下へSkills instructionsを作成する。各Skillは「いつ使うか」だけでなく、前提入力、実行手順、禁止事項、成果物の形式、停止条件、決定論的な検証方法を定義する。Skill同士で重複する判断を持たせず、前段の成果物を後段の入力として渡す。

### 共通Skill契約

全Skillに次の形式を適用する。

```markdown
# Skill name

## Purpose
このSkillが解決する問題と、対象外の作業。

## Trigger
いつ呼び出すか。Issueラベル、Workflow、前段成果物など。

## Required inputs
- Issue/PR番号と本文
- リポジトリの対象ブランチと変更差分
- 前段Skillの成果物
- 品質基準、リスク、テスト観点カタログ

## Procedure
1. 読み取るファイルと順序
2. 判断する項目
3. 生成・変更する項目
4. 決定論的な検証を実行する

## Output contract
JSON/Markdownのファイル名、必須キー、許容値、生成場所。

## Stop conditions
不足情報、対象外変更、高リスク、権限不足、検証失敗時の停止方法。

## Do not
推測による受入条件の補完、無関係な変更、秘密情報の出力、テスト成功の捏造、承認なしのマージ。

## Verification
出力スキーマ検証、許可パス検証、テスト、lint、build、差分確認。
```

### 作成するSkills

#### `01-issue-intake-and-triage`

- **目的:** Issueの曖昧さを減らし、AI実装へ進めてよいかを判定する。
- **入力:** Issue本文、テンプレート項目、ラベル、Projectフィールド。
- **出力:** `issue-contract.json`。背景、目的、受入条件、対象範囲、影響領域、severity、リスク、AI実行可否、不足情報を含める。
- **停止:** 受入条件・期待動作・対象範囲が不足、critical/high、認証・個人情報・決済・DB破壊的変更。
- **検証:** 必須キー、許容ラベル、Issue番号、Project状態、重複実行の確認。

#### `02-repository-analysis`

- **目的:** 実装前に構成、関連コード、既存テスト、依存関係、過去の品質情報を調べる。
- **入力:** `issue-contract.json`、リポジトリ構造、関連Issue/PR、`README`、テスト戦略、既存Workflow。
- **出力:** `repository-analysis.md` と `impact-matrix.json`。候補ファイル、影響領域、依存関係、既存テスト、想定リスク、調査範囲を記録する。
- **停止:** 影響範囲を説明できない、仕様と実装が矛盾、変更対象が特定できない。
- **検証:** 参照したファイルパスの存在、候補ファイルと影響領域の整合性。

#### `03-test-observation-design`

- **目的:** Issueと解析結果から、テスト観点カタログに基づくテスト設計を作成する。
- **入力:** `issue-contract.json`、`impact-matrix.json`、テスト観点カタログ、過去障害。
- **出力:** `test-design.md` と `test-design.json`。観点ID、目的、前提、入力、期待結果、テストレベル、設計理由、優先度、未実施理由、残存リスクを含める。
- **必須観点:** 正常系、境界値、入力不正、エラー処理、認証・認可、データ整合性、API契約、UI表示、既存回帰、主要ユーザーフロー。影響しない観点も「対象外の理由」を残す。
- **停止:** 必須観点の理由がない、完了基準がない、AI提案だけでリスク判断を完結しようとしている。
- **検証:** 観点カタログの必須項目消化、Issue受入条件との対応、未実施理由の存在。

#### `04-implementation-and-test`

- **目的:** 許可された範囲だけを変更し、実装と対応テストを作成する。
- **入力:** `issue-contract.json`、`repository-analysis.md`、`impact-matrix.json`、`test-design.json`。
- **出力:** コード、Unit/Integration/E2Eテスト、変更サマリ、変更ファイル一覧。
- **ルール:** FrontendはReactのUnit/Componentテスト、Backend/APIはNode.jsのUnit/Integrationテスト、E2EはPlaywrightを優先する。主要ユーザーフローに影響する場合だけE2Eを追加する。使用するテストランナーは、実装対象リポジトリの標準（例: Vitest/Jest、React Testing Library）に合わせて固定する。
- **停止:** 許可パス外の変更、差分上限超過、依存追加、DB/認証の高リスク変更、テスト設計と実装の不一致。
- **検証:** `git diff --check`、変更許可パス、対象テスト、build、依存差分、秘密情報検出。

#### `05-test-execution-and-evidence`

- **目的:** AIの自己申告ではなく、CI実測値でテスト結果を確定する。
- **入力:** 変更ブランチ、`test-design.json`、実行環境、Docker Compose設定。
- **出力:** `test-result.json`、Unit/Integration/Playwrightレポート、coverage、失敗時のtrace/screenshot/video/log。
- **必須記録:** 実行コマンド、環境、開始終了時刻、件数、成功/失敗/未実施、coverage、再実行回数、失敗理由、Workflow URL。
- **停止:** テスト失敗、判定不能、未実施の隠蔽、サービスhealth check失敗、coverage測定不能。
- **検証:** React frontend unit/component + coverage、Node.js backend/API unit/integration + coverage、build、必要なPlaywright E2E、DBを含む結合確認、Artifact存在確認。

#### `06-pr-report-and-ai-review`

- **目的:** PRへ設計意図・結果・残存リスクを提示し、AIレビューを補助ゲートとして実行する。
- **入力:** Issue、変更差分、`test-design.json`、`test-result.json`、未実施項目。
- **出力:** PR本文、AIレビュー結果、Workflow Summary、Artifact、Issueコメント。
- **必須記録:** 変更概要、影響範囲、テスト観点と理由、実施/未実施、残存リスク、AI利用内容、人間確認欄。
- **停止:** 結果とPR本文の不一致、AIレビュー判定不能、残存リスク未記載。
- **検証:** Issue/PR紐付け、差分とテスト対象の整合性、同一Run ID、重複コメント更新。

#### `07-merge-decision`

- **目的:** Autoマージを安全に制御する。
- **入力:** Branch protectionのStatus Check、CI結果、AIレビュー結果、人間レビュー、リスク判定。
- **出力:** Auto-merge設定または停止理由コメント。
- **許可条件:** 必須CI成功、AIレビュー成功、人間承認1件、最新コミット一致、Draft解除、critical/highなし、fork/権限問題なし。
- **停止:** 条件が1つでも欠ける場合。停止理由と手動対応を必ず出力する。
- **禁止:** AI承認を人間承認として数える、WorkflowからBranch protectionを迂回する、失敗を成功に変換する。

#### `08-retrospective-and-improvement`

- **目的:** 2週間単位でAIと人間の判断を評価し、次のサイクルへ反映する。
- **入力:** Issue/PR/Workflow/Artifactの集計、見逃し不具合、本番障害、停止理由。
- **出力:** 振り返りMarkdown、改善候補、採用/却下理由、次サイクルの仮説。
- **必須指標:** AI実行数、PR化率、CI/E2E失敗率、coverage推移、再実行回数、AI提案の採用/却下、見逃し、誤検知、Auto-merge停止理由。
- **停止:** データ欠落、AI提案と人間判断の混同、改善項目に担当・期限・検証方法がない。

### Skillsの配置と命名

- 配置先: `.github/skills/`
- ファイル名は動詞ではなく役割が分かる安定した名前にする。例: `issue-intake-and-triage.md`、`test-observation-design.md`。
- 番号は実行順を示す補助情報であり、依存関係の正本はSkill内のRequired inputs/Outputsにする。
- 既存の`create_issue.md`、`build_test_design_input.md`、`review_pr.md`、`generate_e2e_test.md`、`analyze_cicd_error.md`などは廃棄せず、共通契約へ統合するか、役割が重複する部分を整理する。
- Skillsから直接マージや権限変更を行わせず、GitHub ActionsとBranch protectionを最終的な制御点にする。

## 推奨する作業順

実装の作業順は、機能の見た目ではなく「AIの判断を安定させる順」にする。Skillsを先に作り、後からWorkflowとエージェントを接続する。

1. **M0前半: GitHubとリポジトリの現状確認**
   - Projectフィールド、Issueラベル、Branch protection、既存Workflow、Secrets/Variables、Copilot利用形態を確認する。
   - React frontend、Node.js backend/API、DB、必要なinfraの実行コマンドと、品質レポート形式を確認する。
2. **M0後半: 共通契約と観点カタログの作成**
   - Issue/解析/テスト設計/実行結果/PRレポートのスキーマを確定する。
   - テスト観点カタログ、severity、停止条件、許可パス、差分上限、AI/人間の責務を確定する。
3. **M1: Skills instructionsを作成・レビュー**
   - `01`〜`08`のSkillsを作り、各Skillの入力・出力・停止条件・検証方法を固定する。
   - 既存Skillsとの重複を整理し、サンプルIssueで各Skillを単独実行して出力を確認する。
   - この段階ではコード変更やAutoマージを許可しない。
4. **M1: IssueテンプレートとProject状態をSkillsに合わせる**
   - AIが推測しなくて済む入力欄を追加し、Issueの確定状態とAI実行対象を分離する。
   - triage結果とProject状態の遷移を定義する。
5. **M2: 読み取り専用の解析・テスト設計フロー**
   - Issue取得、triage、リポジトリ解析、影響範囲、テスト設計、停止コメントまでを先に実装する。
   - 生成物をレビューしてから、書き込み権限を付与する。
6. **M2: ブランチ作成と実装・テスト生成**
   - 許可パス、差分上限、ブランチ命名、Issue紐付けを検証してからCopilotに書き込みを許可する。
   - 実装とテスト実装を別ステップにし、テスト設計との差分を検証する。
7. **M3: 決定論的CIと証跡収集**
   - Unit、Backend、coverage、build、必要なE2Eを実行し、失敗時Artifactと結果JSONを揃える。
   - 既存Workflowとの重複を整理し、必須Status Check名を確定する。
8. **M3: PRレポートとAIレビュー**
   - PR本文・コメント・Summary・Artifactを同じRun IDで関連付ける。
   - AIレビューを補助ゲートとして追加し、人間承認とは別のStatus Checkにする。
9. **M4: Autoマージを最後に有効化**
   - まず停止だけを実装し、条件未達時の挙動を確認する。
   - テスト成功、AIレビュー成功、人間承認1件、Branch protectionを確認できた後にだけAuto-mergeを有効化する。
10. **M5: 2週間振り返り**
    - 運用ログとレポートを集計し、Skills・観点カタログ・ゲートの改善候補を人間が承認する。
11. **M6: スクリプト化とJev接続を評価**
    - 定型処理の実行回数と失敗パターンを見てから、Jev導入の費用対効果と置換境界を判断する。

## 対象範囲

- 対象リポジトリ: `cocomomojo/copilot-quality-harness`（推奨名。実装開始時に確定）
- 対象アプリ構成: React frontend、Node.js backend/API、DB（種類・ORM・構成はM0で確定）
- テスト構成: ReactのUnit/Componentテスト、Node.jsのUnit/Integrationテスト、Playwright E2E、DBを含む結合テスト
- CI実行環境: GitHub Actions。DBや依存サービスはDocker Compose等で再現可能にする
- GitHub App / GitHub Actions / GitHub Projectsを中心に構成
- エージェントモデルはHaiku想定。ただしモデル名はワークフローに直書きせず、設定・プロンプト・Skillsで役割と出力形式を固定する
- Jevは今回の実装対象外。将来、決定論的スクリプト実行基盤として接続できる境界を残す
- 2週間ごとのAI振り返りは最小構成の後続フェーズとし、今回のレポート形式に必要な入力だけ定義する

## 実装フェーズ

1. **現行資産の接続点を固定**
   - Issueテンプレートの必須入力を、背景・受入条件・影響範囲・リスク・テスト要求に統一する。
   - Issue triageのラベル、ProjectsのStatus/AI処理対象/テスト状態を対応付ける。
   - Copilotエージェントの入力契約を定義し、解析結果、変更ファイル、テスト設計、未実施理由を構造化して出力させる。

2. **Issue起点オーケストレーション**
   - `issues`イベントまたはProject操作から起動できるWorkflowを追加・整理する。
   - Issue取得→triage→対象判定→Copilot起動→変更許可範囲検証→テスト→PR作成を一連の状態機械として扱う。
   - AIが勝手に対象外の変更を広げないよう、許可パス、差分上限、ブランチ命名、Issue/PR紐付けを検証する。
   - 失敗時はIssueコメントとWorkflow Summaryに、停止段階・原因・再実行方法を明示する。

3. **テスト設計・実装の標準化**
   - Issue本文と変更差分を入力に、影響範囲（Frontend/Backend/API/DB/Infra）とリスクからテスト観点を生成する。
   - Unit/IntegrationはReact/Node.jsの標準テストランナーを優先し、ユーザーフローに限定してPlaywright E2Eを追加する。
   - テストケースごとに目的、前提、期待結果、失敗時の判定、設計理由を残す。
   - AIがテストを省略した場合は、対象・理由・代替担保・残存リスクを必須出力にする。

4. **決定論的な品質ゲート**
   - React frontend unit/component + coverage、Node.js backend/API unit/integration + coverage、build、Playwright E2EをPR品質ゲートに統合する。
   - E2EはDocker Composeのサービス起動・health check・依存関係を明示し、テスト失敗時はtrace/screenshot/video/コンテナログをArtifact化する。
   - カバレッジ、テスト件数、成功/失敗/未実施、実行環境、Workflow URLを機械的に収集する。
   - 静的解析・coverageサービス連携は利用可能時のみ実行し、未設定時は理由を明示して品質判断と混同しない。

5. **PR作成・レビュー・Autoマージ**
   - PR本文にIssue、変更概要、影響範囲、テスト設計、テスト結果、未実施項目、残存リスク、AI利用記録を自動挿入する。
   - AIレビューは補助判定として実行し、必須チェックにする。ただしAIだけで品質責任を代替しない。
   - Autoマージは、必須CI成功、AIレビュー成功、人間の承認1件、ブランチ保護の条件を満たした場合だけ有効化する。
   - fork PR、権限不足、secret不足、critical/highリスク、テスト失敗、差分超過は自動マージせず停止する。

6. **レポートと運用**
   - PRコメント、Workflow Summary、Artifactの3箇所で同じ識別子を使い、結果を追跡可能にする。
   - `qa/test-management/reports/` に保存可能なJSON/Markdown形式を定義し、後続の2週間振り返りで集計できるようにする。
   - 振り返り用に、失敗率、再実行回数、AI提案の採用/却下、見逃し不具合、残存リスク、Autoマージ停止理由を記録する。

## AIと人間の責務分担

| 工程 | AI / Copilotエージェント | 人間 |
|---|---|---|
| Issue作成 | 要求を構造化し、背景・受入条件・影響範囲・テスト候補を提案 | 要求の優先度、目的、受入条件、リスクを確定 |
| リポジトリ解析 | 構成、関連コード、既存テスト、変更候補、依存関係を調査 | 解析漏れと変更方針を確認 |
| テスト設計 | 観点カタログから候補を生成し、設計理由と未実施理由を記録 | リスクベースの採否、探索的テスト、完了基準を決定 |
| 実装 | 許可された範囲でコードとテストを変更 | 仕様・設計の妥当性を確認 |
| テスト実行 | Unit、Integration、E2Eを実行し、一次判定と証跡を生成 | 失敗の重要度、再現性、残存リスクを判断 |
| PRレビュー | 差分、テスト、規約、観点漏れをレビュー | 要求・リスク・UX・運用面を最終レビュー |
| マージ | 条件を評価し、条件未達なら停止 | 承認、リスク受容、リリース可否を判断 |
| 振り返り | ログ・失敗・見逃しから改善案を提案 | 改善案の採否とプロセス変更を決定 |

## 状態遷移と停止条件

```text
Issue提案
  -> 人間がIssueを確定
  -> AI triage
  -> 対象判定
  -> リポジトリ解析
  -> ブランチ作成
  -> テスト設計
  -> 実装・テスト実装
  -> Unit/Integration/E2E実行
  -> レポート生成
  -> PR作成
  -> AIレビュー
  -> 人間承認
  -> 必須条件確認
  -> Autoマージ
```

次の条件では、その場で停止して人間へ引き渡す。

- Issueの受入条件、対象範囲、期待動作、再現手順が不足している
- `critical` / `high` リスク、認証・認可、個人情報、決済、DBマイグレーションなどの高影響変更
- AIが変更許可パス外を変更した、差分量が上限を超えた、破壊的変更を検出した
- テスト設計に必須観点・設計理由・完了基準がない
- Unit、Backend、E2E、build、coverage、AIレビューのいずれかが失敗・未実施・判定不能
- secret、権限、GitHub App、Dockerサービス、テストデータなどの前提が不足している
- fork PR、外部コントリビューター由来の変更、または安全に書き戻せない実行環境
- 人間承認がない、または承認後に差分が変わった

## マイルストーン

### M0: 現状固定と安全設計（準備）

**目的:** 既存資産とGitHub設定を壊さず、AIに渡す前提を定義する。

- 既存Workflow、Issueテンプレート、Agents、Skills、Scripts、Projectフィールド、Branch protectionを棚卸しする。
- React frontend、Node.js backend/API、DB、Docker Compose等の実行条件と、Unit/Integration/Playwright/coverageの出力形式を確認する。
- Issue、PR、テスト設計、テスト結果、品質レポートのJSON/Markdownスキーマを決める。
- AIが変更可能なパス、差分上限、禁止操作、停止条件、必要なSecrets/Variablesを定義する。
- 成果物: `plan.md`、運用前提一覧、入力/出力スキーマ、リスク一覧。

**完了条件:** 実装担当Copilotが、追加で推測せずに必要なファイル・権限・入力・判定条件を特定できる。

### M1: Issue入力とAI提案の標準化

**目的:** AIの開始点を安定させ、曖昧なIssueを自動実装へ流さない。

- Feature、Bug、E2E、ManualなどのIssueテンプレートを、背景、目的、受入条件、影響範囲、リスク、非機能、テスト要求付きに統一する。
- AIによるIssue提案を、人間が確定するDraft/Review状態として生成する。
- Issue triageで分類、severity、bug pattern、AI実行可否をラベルとProjectフィールドへ反映する。
- AI実装対象外を明確にし、対象外はfix briefや解析レポートだけを出して停止する。

**完了条件:** Issueから、AI実行可否と必要なテスト範囲が機械的に判定でき、人間がIssueを確定できる。

### M2: 解析・ブランチ・実装・テスト設計

**目的:** Copilotエージェントが同じ手順で安全に変更を作る。

- Issue、既存コード、関連テスト、過去障害、テスト戦略を読み、解析結果を保存する。
- Issue番号を含むブランチを作り、Issue/ブランチ/PRを紐付ける。
- 影響範囲をFrontend/Backend/API/DB/Infra/Docsに分類する。
- テスト観点カタログから必須観点を選び、Unit/Integration/E2E/Manualの配分と設計理由を作る。
- 実装とテスト実装を分離し、テストを追加しない場合も理由と残存リスクを記録する。

**完了条件:** PR作成前に、変更ファイル一覧、影響範囲、テスト設計、未実施理由、残存リスクが存在する。

### M3: 決定論的CIと品質レポート

**目的:** AIの自己申告ではなく、GitHub Actionsの実測結果で品質を判定する。

- React frontend unit/component + coverage、Node.js backend/API unit/integration + coverage、build、Playwright E2Eを実行する。
- E2EとDB結合テストはDocker Compose等のhealth check、テストデータ、trace/screenshot/video、サービスログを証跡化する。
- Test result、coverage、実行時間、再実行回数、未実施、失敗分類、Workflow URLを同一Run IDでまとめる。
- PRコメント、Workflow Summary、Artifactに同じ結果を出し、失敗を成功扱いにしない。
- 既存の`pr-quality.yml`、`e2e.yml`、PR test plan生成資産との重複を整理する。

**完了条件:** PR上でUnit、Backend、E2E、coverage、buildの結果と失敗証跡を確認できる。

### M4: AIレビューと安全なAutoマージ

**目的:** 自動化を進めつつ、品質責任を人間から奪わない。

- AIレビューを、差分、Issue受入条件、テスト設計、観点カタログ、残存リスクに対して実行する。
- AIレビュー結果を必須Status Check化し、AI承認を人間承認と別物として記録する。
- Branch protectionで必須CI、AIレビュー、人間承認1件、最新コミット確認を要求する。
- 条件をすべて満たしたPRだけAuto-mergeを有効化する。
- 高リスク、secret不足、fork、テスト未実施、AIレビュー判定不能ではAuto-mergeを設定しない。

**完了条件:** 条件未達のPRが自動マージされず、停止理由と人間の次の対応がPRに残る。

### M5: 2週間単位の振り返り

**目的:** AIの失敗と人間の判断を次のサイクルへ反映し、テスト精度を継続改善する。

- 2週間ごとに、Issue数、AI実行数、PR作成率、CI失敗率、E2E失敗率、coverage推移、再実行回数を集計する。
- AI提案の採用/却下、テスト観点の不足、見逃し不具合、本番障害、誤検知、停止理由を分類する。
- 人間が改善案を承認し、観点カタログ、Skills、Issueテンプレート、品質ゲート、許可範囲へ反映する。
- 振り返りレポートには、AIの提案と人間の最終判断を分けて記録する。

**完了条件:** 改善項目に担当・期限・変更対象があり、次の2週間で検証可能な仮説になっている。

### M6: 将来の決定論的スクリプト化とJev接続（将来）

**目的:** 定型処理をさらに機械化し、Copilotセッション開始の手間を減らす。

- Issue/PRペイロード検証、テスト観点選択、レポート集計、Artifact整理をスクリプト化する。
- GitHub Appの`workflow_dispatch`や手動操作から、個別処理を呼び出せるようにする。
- スクリプトの入力/出力/終了コード/ログを固定し、Jev導入時に実行単位を置き換えられるようにする。
- Jevは、M1〜M5の品質基準と停止条件が安定してから導入を判断する。

**完了条件:** AIが不要な定型処理をスクリプトだけで再現でき、Jev導入が品質基準を緩めずに行える。

## 最初の実装スライス

最初から全自動化せず、次の1本の成功経路を完成させる。

1. 人間がFeature Issueを作成し、受入条件と影響範囲を確定する。
2. 手動Workflow dispatchでIssue番号を指定する。
3. Issue triageと対象判定を行う。
4. Copilotが解析結果・テスト設計・実装・Unitテストを作成する。
5. Playwright E2Eは、変更が主要ユーザーフローに影響する場合だけ実行・追加する。
6. PRをDraftで作成し、テスト結果と残存リスクをコメント・Artifactへ出力する。
7. 人間がテスト設計と差分を確認してReady for reviewにする。
8. 必須CIとAIレビューが成功し、人間が1件承認した場合だけAuto-mergeを有効化する。

このスライスが安定してから、Issueイベント起動、Project自動遷移、Issue提案の自動生成、2週間振り返り、Jev接続の順に拡張する。

## 主な変更候補

- `.github/workflows/`: Issue起点オーケストレーション、React/Node.js/DBのPRテスト・レポート、Autoマージ制御
- `.github/agents/`: リポジトリ解析・実装・テスト設計・レビュー役割
- `.github/skills/`: テスト観点カタログ、影響範囲分析、レポート出力、停止条件
- `.github/ISSUE_TEMPLATE/`: AI処理に必要な入力項目
- `.github/pull_request_template.md`: 自動生成結果・残存リスク・人間承認の記録
- `scripts/`: 決定論的なIssue/PRペイロード検証、レポート集計、許可パス検証
- `frontend/`・`backend/`・`db/`・`infra/`: React、Node.js、DB、サービス起動とテスト実行方法（新規リポジトリの構成に合わせて確定）
- `qa/test-management/`: テスト設計テンプレート、結果スキーマ、振り返り入力
- `README.md`または運用Wiki: Secrets、Variables、Projectフィールド、Branch protection、再実行手順

## 受入基準

- Issueから起動した処理が、停止条件を含めて追跡可能な状態遷移を持つ。
- AIが作成・変更した内容に対して、影響範囲とテスト設計の根拠がPRに残る。
- Frontend/Backend Unit、Playwright E2E、coverage、buildの結果がPRとArtifactから確認できる。
- テスト未実施・スキップ・失敗・残存リスクが成功扱いで隠されない。
- Autoマージは、必須CI・AIレビュー・人間承認1件のすべてを満たさない限り実行されない。
- fork/secret不足/権限不足/高リスク変更では、安全に停止し、手動対応方法を表示する。
- 手動E2E、Issue triage、PR quality workflowを段階的に導入・無効化・再実行できる。
- 実装担当Copilotが本ファイルだけを入力としても、参考情報の意図、AI/人間の責務、停止条件、マイルストーン、最初の実装スライスを理解できる。
- 各マイルストーンに成果物と完了条件があり、次の段階へ進める判断を人間が行える。

## 注意事項

- `GITHUB_TOKEN`やCopilot用Tokenに過剰権限を与えず、Workflowごとにpermissionsを最小化する。
- Issue本文やPR本文をシェルへ直接埋め込まず、ファイル経由・JSONパースで扱う。
- AutoマージはリポジトリのBranch protection設定が前提であり、Workflowだけで保護を迂回しない。
- 既存資産を移植する場合も、対象パターン限定のPilotで検証してから一般化し、安全な停止条件を維持する。
- 実装前に、Projectフィールド名、既存Branch protection、利用可能なSecrets/Variables、AIレビュー機能の提供形態を確認する。
- GitHub Copilot App、Copilot CLI、GitHub Actions、GitHub Appの責務と権限を混同しない。利用可能な機能は実装時点のGitHub仕様で再確認する。

## 実装担当Copilotへの引き継ぎ指示

本ファイルを読み終えたら、いきなり全機能を実装せず、まずM0の確認結果を提示すること。実装時は次を守る。

- 新規リポジトリで最初に定義したWorkflow・Scripts・Agents・Skillsを読み、各ファイルの責務を決める。
- 後からアプリ実装を追加する場合は、React/Node.js/DBの変更と自動化基盤の変更を分離し、ロールバック方法を示す。
- AIの出力を正本にせず、必ず決定論的な検証スクリプトまたはGitHub Actionsの結果で判定する。
- 仕様が不明な場合は、推測してAutoマージを有効化せず、停止条件と確認事項をレポートする。
- 変更の各PRに、Issue番号、解析結果、影響範囲、テスト設計の意図、実施/未実施、残存リスク、AI利用内容、人間の最終判断を残す。
- Haikuを使う場合も、モデルの能力に依存せず、Skills・スキーマ・チェックリスト・テストで出力を安定させる。
- 実装後は、対象を絞ったテストから実行し、失敗を修正してから次のマイルストーンへ進む。
