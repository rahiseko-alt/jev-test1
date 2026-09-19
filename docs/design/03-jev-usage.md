# Jevの使い方

公式ドキュメント（<https://docs.typesafe.ai>）で確認した仕様と、本アプリでの使い方の決定。

## 質問の3つの型

| 型 | 返るもの | 制限 |
| --- | --- | --- |
| `noul` | 0〜1の確率（はい/いいえ）。確信度は返らない | — |
| `choice` | 選ばれた選択肢、全選択肢の確率、確信度 | 選択肢は最大255 |
| `score` | 重み付き平均の点数、各段階の説明、確率、確信度 | 段階は2以上10以下 |

出典: <https://docs.typesafe.ai/api> / <https://docs.typesafe.ai/primitives/choice> / <https://docs.typesafe.ai/primitives/score> / <https://docs.typesafe.ai/primitives/noul>

## 本アプリでの割り当て

| 工程 | 型 | 内容 |
| --- | --- | --- |
| D1 関連性 | `noul` | この証拠は主張の真偽に関係するか |
| D2 立場 | `choice` | 支持 / 否定 / どちらでもない / 判断できない |
| D3 充足 | Jevを使わない | 件数と品質の条件をコードで計算する |
| D4 最終判定 | `choice` | 支持 / 否定 / 証拠不足（「一部のみ支持」はMVPでは出さない） |

D1とD2は**同じ証拠に対する2問なので、必ず1回のリクエストにまとめる**。
Jevは`state`を1回だけ読み、全問を並列に評価するため、まとめると安く速い。
公式の実測では、13問を1回にまとめると個別に投げた場合より12.2倍安く10.0倍速い
<https://docs.typesafe.ai/cookbooks/parallel_questions>。

## 確信度の扱い

- `choice`と`score`には0〜1の確信度が付く。`noul`には付かない <https://docs.typesafe.ai/api>
- 公式は3段階で使うことを勧めている。高い=自動処理、中=注意して進む、低=行動しない <https://docs.typesafe.ai/confidence>
- 公式のサンプルでは0.5未満を「本当に分からない」として人間に回している

本アプリの決定:

- **0.5未満の立場判定は「判断できない」として扱い、証拠の分類に使わない**。ただし捨てずに残し、画面には「Jevが判断できなかった証拠」として表示する
- 確信度の数値は必ず画面に出す（仕様§10の透明性要件）
- 閾値は設定ファイルで変えられるようにする

## 入力量の上限と、長い証拠の扱い

- 1リクエスト64,000トークン。`state`と最も長い質問の合計で32,000トークン <https://docs.typesafe.ai/models>
- ただし別ページには「約32,000トークン」とのみ書かれており記述が食い違う <https://docs.typesafe.ai/primitives>
- よって**保守的に32,000トークンを上限として実装する**

長い証拠は機械的に分割し、断片ごとにD1・D2を判定する。
断片ごとの結果のまとめ方は **確信度が最も高い断片の判定を、その証拠の判定とする**（Q2の決定）。
分割した事実と、各断片の判定は保存して画面から確認できるようにする。

## 制限とエラー

| 項目 | 値 |
| --- | --- |
| レート制限 | 250,000トークン/秒、1,200リクエスト/分。超過で`429` |
| エラー | `401`鍵不正 / `422`リクエスト不正 / `429`制限超過 / `529`過負荷 |
| リトライ | 429と529は指数バックオフで再試行。SDKが既定で行う（最大2回、初回500ms、上限5,000ms、`Retry-After`を尊重） |
| 1回あたりのタイムアウト | SDK既定10,000ms |

出典: <https://docs.typesafe.ai/models> / <https://docs.typesafe.ai/api> / <https://docs.typesafe.ai/sdk/javascript/api/interfaces/RetryPolicy>

注意: 公式が「レート制限は予告なく変わる」と明記している。上限に達したときに処理を止めず、
待って再開できる作りにする。

## 料金

- 入力トークンのみ課金。出力は無料。100万トークンあたり $0.042 <https://docs.typesafe.ai/models>
- `usage.input_tokens` が返るので、1回の検証にかかった費用を画面に出せる

## モデルの指定

`jev-latest` を既定にする。確信度の閾値を調整し込んだ後は、
`jev-1.13.0` のようにバージョンを固定できるよう設定可能にする <https://docs.typesafe.ai/models>。

## 最大の技術リスク: 日本語の精度

公式ドキュメントに次の記載がある <https://docs.typesafe.ai/models>。

> English is the primary training language and where accuracy is currently best.
> Other languages, including CJK scripts, are handled but not equally well

本アプリの主な利用言語は日本語であり、この注意はそのまま直撃する。
**実装に入る前に、日本語の主張と日本語の証拠30〜50件で、人間の判断とどれだけ一致するかを測る。**
一致率が低ければ、質問文（instructions）だけ英語で書き、証拠本文は日本語のまま渡す構成を試す。
この検証を飛ばして本実装に入らない。

## 公式ドキュメントで確認できなかったこと

- エラー応答のJSONの具体的な形
- サーバー側のタイムアウト値
- ストリーミング対応（記載なし）
- 確信度の算出式
