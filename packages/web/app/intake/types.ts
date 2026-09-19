/**
 * 入口の聞き取りでやり取りする形と、その検査。
 * ここには生成AIの呼び出しを書かない。
 *
 * 画面から戻ってくる値（やり取りの履歴、提案）は、隠し項目に載って往復するため
 * 信用できない。必ずここの検査を通してから使う。
 */

import type { SearchTerms } from "@factchecker/core/claims";
import { z } from "zod";

export const IntakeTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string(),
});

export type IntakeTurn = z.infer<typeof IntakeTurnSchema>;

export const IntakeTurnsSchema = z.array(IntakeTurnSchema);

/** 検証する主張が固まったとき。利用者の承認を待つ。 */
export const ReadyToConfirmSchema = z.object({
  status: z.literal("ready"),
  claim: z.string().trim().min(1),
  searchTerms: z.object({
    support: z.array(z.string().trim().min(1)).min(1),
    refute: z.array(z.string().trim().min(1)).min(1),
  }),
});

export type ReadyToConfirm = z.infer<typeof ReadyToConfirmSchema>;

/** まだ絞り込みが要るとき。 */
export interface NeedsMoreInfo {
  readonly status: "needs_more_info";
  readonly question: string;
}

export type IntakeReply = NeedsMoreInfo | ReadyToConfirm;

/** 画面に出す検索語は、core が保存する形と同じものであることを型で示す。 */
export type ProposedSearchTerms = SearchTerms;
