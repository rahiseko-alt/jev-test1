# 土台の選定とアーキテクチャ

## Remix 3 で作れるか: 条件付きで可能

2026-09-19 時点で確認した事実。

| 項目 | 確認した内容 |
| --- | --- |
| 安定版 | **まだ出ていない**。npmの`latest`は 2.17.5（Remix 2系） |
| Remix 3 の現状 | `next`タグが `3.0.0-rc.3`。公開は 2026-09-18（昨日） |
| 安定版の予定 | **2026-10-02**、Remix Jam にて公開予定 |
| 開発状況 | 機能追加は完了済み。残るのは不具合修正とセキュリティ監査 |
| ライセンス | MIT |
| 開始コマンド | `npx remix@next new my-remix-app` |
| UIの実装 | React ではない。Preact をフォークした独自のビューレイヤ |
| 必要なNode | **24.3.0 以上** |
| ビルド段階 | 無い。TypeScript・JSX・CSSは要求時にその場で変換される |
| ドキュメント | 全15章のうち**7章が未公開（404）**。DB・フォーム・認証・ファイル・エラー処理・CLI・本番運用 |
| SemVer | RC時点では**まだ適用していない**と公式が明言 |
| 週間ダウンロード数 | 約16,000（React Router は約4,790万） |

出典: npmレジストリ（`https://registry.npmjs.org/remix` の dist-tags と `engines`）、
<https://remix.run/blog/remix-3-release-candidate>、
<https://remix.run/blog/wake-up-remix>、
<https://github.com/remix-run/remix/releases>、
<https://guides.remix.run/start-here/>、
<https://api.remix.run/>

データベースは公式の `remix/data-table` があり、PostgreSQL・MySQL・SQLite に対応し、
移行（マイグレーション）のCLIも同梱されている <https://api.remix.run/api/remix/data-table/overview/>。
Drizzle など他のものに差し替えることも公式に想定されている。

ただし**ガイドの「Data and Validation」「Auth, Sessions, and Security」「Errors and Cancellation」
「Production」の各章は現時点で404で、公開されていない**。手順書はAPIリファレンスしか無く、
データベース・認証・本番運用は自力で組み立てることになる。

### 判定

**条件付きで可能**。次の2点を守れば採用してよい。

1. **10月2日の安定版を待ってから本実装に入る**。リリース候補は2〜3週間ごとに更新されており
   （rc.1: 8/31、rc.2: 9/8、rc.3: 9/18）、9/18の更新だけでも複数の破壊的変更が入っている。
   また `remix` が 3.0.0 になっても、内部の40以上のパッケージは 0.x のままである
2. **判定の中身をRemixに依存させない**（下記の層分け）
3. **Node 24.3 以上を自前で用意できるサーバーに置く**。ビルド段階が無い設計のため、
   ビルドを前提とする配置先（Vercel など）との相性は公式に検証も文書化もされていない

10月2日を待てない、あるいは上の3点を飲めない場合は、実績のある React Router 7 を使う。
Remix 2 の後継は Remix 3 ではなく React Router 7 であることも、公式が明言している
<https://remix.run/blog/wake-up-remix>。

### Reactのライブラリが使えない点について

Remix 3 のUIは React ではなく、Preact をフォークした独自のものである
<https://remix.run/blog/wake-up-remix>。既存のReact向けUIライブラリはそのままでは使えない
（描画部分をReactベースのものに差し替えることは可能、と公式は書いている）。

本アプリの画面は、支持側と反対側の二列、証拠カード、調査ツリーといった独自のものが中心で、
既製のUIライブラリに頼る部分が少ないため、この制約は受け入れられる。

## 層の分け方

Remix 3 が予定どおりに出なかった場合や、将来別の土台に移す場合に備え、
**中核部分をフレームワークから切り離す**。

```
packages/
├── core/          ← フレームワークに依存しない素のTypeScript
│   ├── claim/         主張の正規化
│   ├── search/        検索（Tavily。差し替え可能）
│   ├── fetch/         本文取得（fetch + readability）
│   ├── quality/       機械的な品質確認
│   ├── judge/         Jev呼び出しと判定
│   ├── sufficiency/   証拠が足りているかの計算
│   └── verdict/       最終判定と固定テンプレート
└── web/           ← Remix 3。画面と入口の聞き取りだけ
```

`core` は単体で動かせて、テストもフレームワーク無しで書ける。
`web` は `core` を呼んで結果を並べるだけにする。

生成AIを呼ぶのは `web` の入口のみ。`core` には生成AIのクライアントを一切入れない。
この分離自体が、仕様の「確定後は生成AIを使わない」を構造で保証する。

## データモデル

仕様§19をもとに、決定事項を反映した形。

### Claim（検証対象）

```
id
original_input        ユーザーの素の入力
normalized_claim      確定した検証文
search_terms          入口の生成AIが出した検索語一式（支持方向・反証方向）  ← Q1の決定
status                collecting | judging | done | insufficient
created_at
```

`search_terms` を確定時に保存することで、以降の再検索でも生成AIを呼ばずに済む。

### Evidence（証拠）

```
id
claim_id
url
title
source                ドメイン
published_at
retrieved_at
content               自分で取得して抜き出した本文（検索APIの返り値は保存しない）
is_primary_source
origin                initial | strengthen | refute   どの調査で得たか
user_state            default | adopted | excluded    ユーザーの手動操作
```

### EvidenceChunk（長い証拠の分割）

```
id
evidence_id
index
text
```

### EvidenceJudgement（Jevの判定）

```
id
evidence_id
chunk_id              分割した場合のみ
relevance_noul        0〜1
stance                support | refute | neutral | unknown
stance_probabilities  全選択肢の確率
confidence            0〜1
model_version         応答した実際のモデルID
input_tokens
judged_at
is_representative     この証拠の代表判定か（確信度が最大の断片）  ← Q2の決定
```

### QualityCheck（機械的な品質確認）

```
evidence_id
accessible
official_source
date_match
duplicate_of          重複元のevidence_id
```

### InvestigationBranch（ユーザーの調査分岐）

```
id
claim_id
parent_evidence_id
type                  strengthen | refute
search_terms_used
created_at
```

### Verdict（最終判定）

```
id
claim_id
result                support | refute | insufficient
supporting_count
contradicting_count
primary_source_count
evidence_sufficient
computed_at
```

## 処理の流れ

```
ユーザー入力
  ↓ web: 生成AIが聞き取り（複数往復）
検証文 + 検索語一式の候補
  ↓ web: ユーザーが確認して確定  ← ここから先、生成AIを呼ばない
  ↓ core/search: 支持方向・反証方向の両方で検索
URL一覧
  ↓ core/fetch: 本文を取得
  ↓ core/quality: 到達性・公式性・日付・重複
証拠候補
  ↓ core/judge: 32,000トークンを超えるものは分割
  ↓ core/judge: 証拠ごとに1回のリクエストで「関連性」と「立場」を判定
  ↓ core/judge: 断片は確信度が最大のものを代表とする
判定済み証拠
  ↓ core/sufficiency: 足りているか計算
  ├─ 足りない → 検索語一式の次の語で再検索へ戻る（語が尽きたら「証拠不足」）
  └─ 足りる  ↓
  ↓ core/verdict: 最終判定
  ↓ web: 固定テンプレートで表示
結果
```

## エラー処理

| 起きること | どうするか |
| --- | --- |
| 検索APIが429 | `Retry-After`に従って待つ。上限を超えたらそこまでの証拠で続行し、「検索が途中で止まった」と画面に出す |
| 本文が取れない（403/タイムアウト/本文抽出失敗） | その証拠を「取得できなかった」として除外し、除外理由として記録。URLは画面に残す |
| Jevが429/529 | SDKの既定（指数バックオフ、最大2回）に任せる。なお失敗したら、その証拠を「判定できなかった」として残す |
| Jevが401 | 鍵の設定を促す画面を出して処理を止める |
| Jevが422 | リクエストの組み立ての不具合なので、そのまま失敗させる（隠さない） |
| 証拠が0件 | 「証拠不足」を正式な結果として出す。失敗扱いにしない（仕様§22-2） |

**どのエラーも、握りつぶして「判定できました」と表示しない。**
画面には必ず「何件を取りに行き、何件が取れ、何件が判定できなかったか」を出す。

## OSS配布のための鍵の扱い

必要な鍵（すべて利用者が自分で用意する）:

```
TYPESAFE_API_KEY        Jev。必須
TAVILY_API_KEY          Web検索。必須
OPENAI_API_KEY 等       入口の聞き取り用。必須（どれを使うかは設定で選ぶ）
GOOGLE_FACTCHECK_KEY    既存ファクトチェック検索。任意
CROSSREF_MAILTO         Crossrefの連絡先。任意（入れると上限が緩む）
```

- `.env.example` を用意し、実際の鍵はリポジトリに一切入れない
- 鍵が無いまま起動した場合は、起動時に「どの鍵が足りないか」を明示して止める
- 画面からも鍵を設定できるようにし、入力された鍵はサーバー側にのみ保持する

## ライセンス

- 本体: MIT
- `@mozilla/readability`: Apache-2.0 → MITのプロジェクトに同梱可
- `@typesafe-ai/sdk`、`remix`: いずれもnpm上の表示はMIT
- Firecrawl は中核がAGPL-3.0との情報があり未確認のため、**同梱しない**（使うとしてもAPI越しのみ）

依存を追加するときは、必ずライセンスを確認してからにする。
