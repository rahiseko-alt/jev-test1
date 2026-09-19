/**
 * 検証する主張の保存と取り出し。
 *
 * 主張が確定した時点で、以降の検索で使う検索語も一緒に保存する。
 * 確定より後の工程で生成AIを呼ばずに済ませるための要になる。
 */

import { randomUUID } from "node:crypto";
import type { Database } from "../db/index.ts";

/** 主張の状態。証拠を集めている途中か、判定まで終わったか。 */
export const CLAIM_STATUSES = [
  "collecting",
  "judging",
  "done",
  "insufficient",
] as const;

export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/**
 * 検索語一式。支持方向と反対方向の両方を必ず持つ。
 * 片側だけで調べることを、型と検査の両方で許さない。
 */
export interface SearchTerms {
  readonly support: readonly string[];
  readonly refute: readonly string[];
}

export interface Claim {
  readonly id: string;
  readonly originalInput: string;
  readonly normalizedClaim: string;
  readonly searchTerms: SearchTerms;
  readonly status: ClaimStatus;
  readonly createdAt: string;
}

export interface NewClaim {
  readonly originalInput: string;
  readonly normalizedClaim: string;
  readonly searchTerms: SearchTerms;
}

/** 保存できない主張が渡されたときに投げる。 */
export class InvalidClaimError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidClaimError";
  }
}

const nonBlankTerms = (terms: readonly string[]): string[] =>
  terms.map((term) => term.trim()).filter((term) => term.length > 0);

const validate = (claim: NewClaim): SearchTerms => {
  if (claim.normalizedClaim.trim() === "") {
    throw new InvalidClaimError("検証する主張が空です。");
  }

  const support = nonBlankTerms(claim.searchTerms.support);
  const refute = nonBlankTerms(claim.searchTerms.refute);

  if (support.length === 0) {
    throw new InvalidClaimError("支持する材料を探すための検索語がありません。");
  }
  if (refute.length === 0) {
    throw new InvalidClaimError(
      "反対する材料を探すための検索語がありません。片側だけを調べることはできません。",
    );
  }

  return { support, refute };
};

interface ClaimRow {
  readonly id: string;
  readonly original_input: string;
  readonly normalized_claim: string;
  readonly search_terms: string;
  readonly status: string;
  readonly created_at: string;
}

/** 保存されているとは限らない値を、型どおりだと決めつけずに読む。 */
export class CorruptClaimError extends Error {
  constructor(id: string, detail: string) {
    super(`保存されている主張（${id}）を読み取れません。${detail}`);
    this.name = "CorruptClaimError";
  }
}

const readStatus = (row: ClaimRow): ClaimStatus => {
  if ((CLAIM_STATUSES as readonly string[]).includes(row.status)) {
    return row.status as ClaimStatus;
  }
  throw new CorruptClaimError(row.id, `知らない状態です: ${row.status}`);
};

const readSearchTerms = (row: ClaimRow): SearchTerms => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.search_terms);
  } catch {
    throw new CorruptClaimError(row.id, "検索語が壊れています。");
  }

  const terms = parsed as Partial<SearchTerms>;
  if (!Array.isArray(terms?.support) || !Array.isArray(terms?.refute)) {
    throw new CorruptClaimError(
      row.id,
      "検索語に、支持方向と反対方向の両方がありません。",
    );
  }
  return { support: terms.support, refute: terms.refute };
};

const toClaim = (row: ClaimRow): Claim => ({
  id: row.id,
  originalInput: row.original_input,
  normalizedClaim: row.normalized_claim,
  searchTerms: readSearchTerms(row),
  status: readStatus(row),
  createdAt: row.created_at,
});

export async function saveClaim(db: Database, claim: NewClaim): Promise<Claim> {
  const searchTerms = validate(claim);

  const saved: Claim = {
    id: randomUUID(),
    originalInput: claim.originalInput,
    normalizedClaim: claim.normalizedClaim.trim(),
    searchTerms,
    status: "collecting",
    createdAt: new Date().toISOString(),
  };

  await db.run(
    `INSERT INTO claims (id, original_input, normalized_claim, search_terms, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      saved.id,
      saved.originalInput,
      saved.normalizedClaim,
      JSON.stringify(saved.searchTerms),
      saved.status,
      saved.createdAt,
    ],
  );

  return saved;
}

export async function getClaim(
  db: Database,
  id: string,
): Promise<Claim | undefined> {
  const [row] = await db.query<ClaimRow>("SELECT * FROM claims WHERE id = ?", [
    id,
  ]);
  return row === undefined ? undefined : toClaim(row);
}
