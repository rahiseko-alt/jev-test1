import { loadConfig } from "@factchecker/core/config";
import type { Route } from "./+types/home";

export function meta(): Route.MetaDescriptors {
  return [{ title: "ファクトチェッカー" }];
}

/**
 * 起動できていることと、いま何につながっているかだけを見せる。
 * 検証の画面は次のチケットで作る。
 */
export function loader() {
  const config = loadConfig(process.env);

  return {
    database:
      config.database.kind === "sqlite"
        ? `SQLite（${config.database.path}）`
        : "PostgreSQL",
    intakeModel: config.intakeModel,
    googleFactCheck: config.googleFactCheckApiKey === undefined ? "未設定" : "設定済み",
    crossrefMailto: config.crossrefMailto ?? "未設定",
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main>
      <h1>ファクトチェッカー</h1>
      <p>
        起動できています。主張を確定する画面は、これから作ります。
      </p>

      <dl>
        <div className="row">
          <dt>データの置き場所</dt>
          <dd>{loaderData.database}</dd>
        </div>
        <div className="row">
          <dt>入口の聞き取りに使うモデル</dt>
          <dd>{loaderData.intakeModel}</dd>
        </div>
        <div className="row">
          <dt>既存のファクトチェック検索</dt>
          <dd>{loaderData.googleFactCheck}</dd>
        </div>
        <div className="row">
          <dt>Crossref の連絡先</dt>
          <dd>{loaderData.crossrefMailto}</dd>
        </div>
      </dl>
    </main>
  );
}
