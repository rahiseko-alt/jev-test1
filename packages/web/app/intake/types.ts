/** 入口の聞き取りでやり取りする形。ここには生成AIの呼び出しを書かない。 */

export interface IntakeTurn {
  readonly role: "user" | "assistant";
  readonly text: string;
}

/** まだ絞り込みが要るとき。 */
export interface NeedsMoreInfo {
  readonly status: "needs_more_info";
  readonly question: string;
}

/** 検証する主張が固まったとき。利用者の承認を待つ。 */
export interface ReadyToConfirm {
  readonly status: "ready";
  readonly claim: string;
  readonly searchTerms: {
    readonly support: readonly string[];
    readonly refute: readonly string[];
  };
}

export type IntakeReply = NeedsMoreInfo | ReadyToConfirm;
