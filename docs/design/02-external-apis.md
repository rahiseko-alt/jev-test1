# 外部APIの選定

2026-09-19 時点で確認した内容。各項目に出典を付けた。
キーは利用者自身が用意する前提（MITのOSSとして配布するため）。

## 採用するもの

| 用途 | 採用 | 理由 |
| --- | --- | --- |
| Web検索 | Tavily | 無料枠1,000クレジット/月がクレジットカード登録なしで取れる唯一の候補 |
| 本文取得 | 自前fetch + `@mozilla/readability` | Apache-2.0でMITに同梱でき、鍵も費用も不要 |
| 論文・撤回情報 | Crossref REST API | キー不要・無料。撤回論文の情報も同じAPIで取れる |
| 既存ファクトチェック | Google Fact Check Tools API | 同等の無償サービスが他に無い |

- Tavily: 無料1,000クレジット/月・カード不要 <https://tavily.com/pricing> ／ 無料キーは100リクエスト/分、超過時は429と`Retry-After` <https://docs.tavily.com/documentation/rate-limits>
- @mozilla/readability: Apache-2.0 <https://github.com/mozilla/readability>
- Crossref: 登録不要・無料 <https://www.crossref.org/documentation/retrieve-metadata/rest-api/> ／ 連絡先を付けると上限が緩む（Polite pool） <https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/>
- 撤回論文はCrossref APIに統合済み（2025-01-29〜） <https://www.crossref.org/blog/retraction-watch-retractions-now-in-the-crossref-api/>
- Google Fact Check Tools API <https://developers.google.com/fact-check/tools/api>

## 使えないもの

| 候補 | 理由 |
| --- | --- |
| Bing Web Search API | 2025-08-11に完全廃止。新規登録も既存利用も不可 <https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement> |
| Google Programmable Search (Custom Search JSON) | 新規受付終了。既存利用者も2027-01-01までに移行が必要 <https://developers.google.com/custom-search/v1/overview> |

## 差し替え可能にしておくもの

Brave Search（$5/1,000件・カード必須 <https://api-dashboard.search.brave.com/documentation/pricing>）、
Exa（初回$20＋毎月$10クレジット <https://exa.ai/pricing>）、
SerpAPI（250検索/月 <https://serpapi.com/pricing>）は、
いずれも検索の差し替え先として使える。検索部分は交換できる作りにする。

## 設計に効く制約（見落とすと規約違反になる）

### 1. 検索APIの結果は貯めない

- Brave: 一般の利用規約は結果の保存権を与えない。保存するには別途許諾が要る <https://brave.com/search/api/>
- Google APIs 利用規約 5(e): スクレイピング、永続的なコピーの作成、データベースの構築を禁じている <https://developers.google.com/terms>

よって**検索APIが返した結果そのもの（順位・スニペット）は保存しない**。
保存するのは、そこから得たURLと、そのURLを自分で取得して抜き出した本文だけにする。
これは仕様§19の `Evidence.content` の定義と矛盾しない。

### 2. 開発者自身のキーをリポジトリに入れない

Google APIs 利用規約 4(b) に「開発者の資格情報をオープンソースプロジェクトに埋め込んではならない」
と明文がある <https://developers.google.com/terms>。
利用者が自分のキーを入れる構成にする（§G2）。

### 3. Semantic Scholar を使う場合はクレジット表記が必要

利用規約に帰属表示の義務があり、APIの再配布・再販は禁止されている
<https://www.semanticscholar.org/product/api/license>。MVPでは使わない。

## 確認できなかったこと

- Google Fact Check Tools API の具体的なクォータ（1日あたりの上限）
- 「利用者が自分のキーを入れるOSSアプリ」が Google 利用規約上で明示的に許されるか（禁止の明文も無い）
- Tavily / Exa / SerpAPI の利用規約本文における、OSS組み込みと結果保存の可否
