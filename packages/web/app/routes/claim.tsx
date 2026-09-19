import { getClaim } from "@factchecker/core";
import { data } from "react-router";
import { SearchTermsColumns } from "../components/search-terms.tsx";
import { getDatabase } from "../db.server.ts";
import type { Route } from "./+types/claim";

export function meta(): Route.MetaDescriptors {
  return [{ title: "確定した主張" }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const claim = await getClaim(getDatabase(), params.claimId);
  if (claim === undefined) {
    throw data("その主張は見つかりませんでした。", { status: 404 });
  }
  return { claim };
}

export default function ClaimPage({ loaderData }: Route.ComponentProps) {
  const { claim } = loaderData;

  return (
    <main>
      <h1>検証する主張</h1>
      <blockquote className="claim">{claim.normalizedClaim}</blockquote>

      <p className="note">
        この内容で確定しました。ここから先は、生成AIに文章を書かせません。
      </p>

      <h2>これから使う検索語</h2>
      <p className="note">
        支持する材料と、反対する材料の両方を探します。片側だけでは調べません。
      </p>

      <SearchTermsColumns terms={claim.searchTerms} />

      <h2>最初の入力</h2>
      <p className="note">{claim.originalInput}</p>

      <p>
        <a href="/">別の主張を確かめる</a>
      </p>
    </main>
  );
}
