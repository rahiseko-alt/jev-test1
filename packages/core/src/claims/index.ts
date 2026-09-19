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

const meaningful = (terms: readonly string[]): string[] =>
  terms.map((term) => term.trim()).filter((term) => term.length > 0);

const validate = (claim: NewClaim): SearchTerms => {
  if (claim.normalizedClaim.trim() === "") {
    throw new InvalidClaimError("検証する主張が空です。");
  }

  const support = meaningful(claim.searchTerms.support);
  const refute = meaningful(claim.searchTerms.refute);

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

const toClaim = (row: ClaimRow): Claim => ({
  id: row.id,
  originalInput: row.original_input,
  normalizedClaim: row.normalized_claim,
  searchTerms: JSON.parse(row.search_terms) as SearchTerms,
  status: row.status as ClaimStatus,
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

/** 新しいものから順に返す。 */
export async function listClaims(db: Database): Promise<Claim[]> {
  const rows = await db.query<ClaimRow>(
    "SELECT * FROM claims ORDER BY created_at DESC, id DESC",
  );
  return rows.map(toClaim);
}
