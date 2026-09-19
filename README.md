# ファクトチェッカー

**AIに答えを書かせないファクトチェッカー。**

生成AIは入口の聞き取りだけに使います。証拠を集めたあとの判定は判断特化モデル（Jev）が行い、
最終的に画面に出る文章は、システムがあらかじめ決めた文面に流し込むだけです。
生成AIが証拠に無いことを書き足す余地を、構造として作りません。

利用者には結果だけでなく、**どの検索語を使い、どの証拠を採用し、何をなぜ除外したか**を
すべて見せます。納得できなければ、その場から自分で調査を分岐できます。

MITライセンスで公開します。

## いまの状態

設計と土台づくりの段階です。検証の画面はまだありません。
進め方と決まったことは [`docs/design/`](./docs/design/) にあります。

- [機能分解とMVPの範囲](./docs/design/01-features.md)
- [外部APIの選定](./docs/design/02-external-apis.md)
- [Jevの使い方](./docs/design/03-jev-usage.md)
- [アーキテクチャ](./docs/design/04-architecture.md)
- [採用する構成](./docs/design/05-stack.md)

作業単位は GitHub の Issues にあります。

## 動かす

### 必要なもの

- Node.js 22.22 以上
- pnpm
- 各サービスの鍵（下記）

### 鍵を用意する

```bash
cp .env.example .env
```

`.env` を開き、少なくとも次の3つを入れてください。入れずに起動すると、
足りている分だけ動くのではなく、**足りない鍵の名前を挙げて停止します**。

| 環境変数 | 用途 | 取得先 |
| --- | --- | --- |
| `TYPESAFE_API_KEY` | 証拠の判定 | <https://console.typesafe.ai/settings/keys> |
| `TAVILY_API_KEY` | Web検索 | <https://tavily.com>（無料枠あり） |
| `ANTHROPIC_API_KEY` | 入口の聞き取り | <https://console.anthropic.com> |

入口の聞き取りは提供元を切り替えられます。`INTAKE_PROVIDER=openai` にすると、
`ANTHROPIC_API_KEY` の代わりに `OPENAI_API_KEY` が必要になります。

鍵はすべて利用者自身のものを使います。このリポジトリに鍵は入っていません。

### 起動する

```bash
pnpm install
pnpm dev
```

または本番向けに組み立てて起動する場合:

```bash
pnpm install
pnpm build
pnpm start
```

どちらの場合も、起動の前に設定の確認とデータベースの用意が自動で走ります。

## データの置き場所

既定は SQLite です。ファイル1つで動くため、試すまでの手数がかかりません。
複数人で使う場合は PostgreSQL に切り替えられます。

```bash
DATABASE_KIND=postgres
DATABASE_URL=postgres://user:password@localhost:5432/factchecker
```

## 開発

```bash
pnpm test        # テスト
pnpm typecheck   # 型の確認
```

構成は2つに分かれています。

- `packages/core` — 検索・証拠・判定。特定の画面の仕組みに依存しません。
  **生成AIのクライアントをここに入れてはいけません**（テストで検査しています）。
  データベースは素のSQLで扱います（[ADR 0001](./docs/adr/0001-sql-without-orm.md)）
- `packages/web` — 画面と、入口の聞き取り

## ライセンス

MIT。[LICENSE](./LICENSE) を参照してください。
