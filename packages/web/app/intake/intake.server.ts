/**
 * 入口の聞き取り。**このファイルだけが生成AIを呼ぶ。**
 *
 * 主張が確定したあとの工程（検索・証拠の取得・判定・表示）では、生成AIを
 * 一切呼ばない。その約束を、呼び出し場所をここ1か所に閉じることで守る。
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Config } from "@factchecker/core/config";
import { z } from "zod";
import type { IntakeReply, IntakeTurn } from "./types.ts";

const SYSTEM_PROMPT = `あなたはファクトチェックの入口で、利用者の漠然とした疑問を「検証できる主張」に変える聞き手です。

守ること:
- 質問は一度に1つだけ。短く、選択肢を添えて聞く。
- 対象（何について）、範囲（どこの話か）、時期（いつの話か）、比較対象（何と比べるのか）、数値の有無が、検証できる程度に定まるまで聞く。
- 3〜5往復を目安に、定まったら主張を1文にまとめる。完璧を求めて聞き続けない。
- 主張は、証拠で真偽を確かめられる形にする。意見や価値判断は主張にしない。
  検証できない相談（好み、予測、助言の依頼）なら、そのことを質問として率直に伝える。

主張が固まったら、検索語も作る:
- support: その主張を支持する材料を探すための検索語。3〜5個。
- refute: その主張を否定・修正・限定する材料を探すための検索語。3〜5個。
  「〜 誤り」「〜 反論」「〜 過大評価」のように、反対側を積極的に探す語にする。
- どちらも空にしてはいけない。片側だけを調べることは許されない。
- 検索語は、検索欄にそのまま貼れる短い語の組み合わせにする。文にしない。

出力は必ず指定された形式で返す。
まだ聞くことがあるなら status は needs_more_info とし、question に質問だけを入れる。
固まったなら status は ready とし、claim と searchTerms を入れる。`;

const ReplySchema = z.object({
  status: z.enum(["needs_more_info", "ready"]),
  question: z.string().describe("status が needs_more_info のときの質問。それ以外では空文字。"),
  claim: z.string().describe("status が ready のときの検証する主張1文。それ以外では空文字。"),
  search_terms_support: z.array(z.string()).describe("主張を支持する材料を探す検索語。"),
  search_terms_refute: z.array(z.string()).describe("主張に反対する材料を探す検索語。"),
});

/** 生成AIの呼び出しが失敗したときに投げる。画面に出す文言を持つ。 */
export class IntakeFailedError extends Error {
  constructor(message: string, options?: { cause: unknown }) {
    super(message, options);
    this.name = "IntakeFailedError";
  }
}

export async function askIntake(
  config: Config,
  turns: readonly IntakeTurn[],
): Promise<IntakeReply> {
  const client = new Anthropic({ apiKey: config.intake.apiKey });

  let response;
  try {
    response = await client.messages.parse({
      model: config.intake.model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: turns.map((turn) => ({ role: turn.role, content: turn.text })),
      output_config: { format: zodOutputFormat(ReplySchema) },
    });
  } catch (error) {
    throw new IntakeFailedError(describeFailure(error), { cause: error });
  }

  const parsed = response.parsed_output;
  if (parsed === null || parsed === undefined) {
    throw new IntakeFailedError(
      "聞き取りの応答を読み取れませんでした。もう一度お試しください。",
    );
  }

  if (parsed.status === "needs_more_info") {
    return { status: "needs_more_info", question: parsed.question };
  }

  return {
    status: "ready",
    claim: parsed.claim,
    searchTerms: {
      support: parsed.search_terms_support,
      refute: parsed.search_terms_refute,
    },
  };
}

const describeFailure = (error: unknown): string => {
  if (error instanceof Anthropic.AuthenticationError) {
    return "聞き取りに使う鍵が受け付けられませんでした。ANTHROPIC_API_KEY を確認してください。";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "聞き取りの呼び出しが混み合っています。少し待ってからお試しください。";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "聞き取りの呼び出し先につながりませんでした。通信を確認してください。";
  }
  if (error instanceof Anthropic.APIError) {
    return `聞き取りの呼び出しが失敗しました（${error.status}）。${error.message}`;
  }
  return "聞き取りの呼び出しが失敗しました。";
};
