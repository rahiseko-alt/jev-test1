import type { SearchTerms } from "@factchecker/core/claims";

/**
 * 支持方向と反対方向を、必ず並べて出す。
 * 片側だけを見せないことが仕様の要求なので、2列を1つの部品にまとめている。
 */
export function SearchTermsColumns({
  terms,
  headingLevel = "h3",
}: {
  terms: SearchTerms;
  headingLevel?: "h3" | "h4";
}) {
  const Heading = headingLevel;

  return (
    <div className="columns">
      <section>
        <Heading>主張を支持する材料を探す</Heading>
        <ul>
          {terms.support.map((term) => (
            <li key={term}>{term}</li>
          ))}
        </ul>
      </section>
      <section>
        <Heading>反対する材料を探す</Heading>
        <ul>
          {terms.refute.map((term) => (
            <li key={term}>{term}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
