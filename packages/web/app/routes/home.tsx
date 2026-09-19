import { InvalidClaimError, saveClaim } from "@factchecker/core";
import { InvalidConfigError, MissingConfigError } from "@factchecker/core/config";
import { Form, redirect } from "react-router";
import { SearchTermsColumns } from "../components/search-terms.tsx";
import { getConfig } from "../config.server.ts";
import { getDatabase } from "../db.server.ts";
import { IntakeFailedError, askIntake } from "../intake/intake.server.ts";
import { parseProposal, parseTurns } from "../intake/parse.ts";
import type { IntakeTurn, ReadyToConfirm } from "../intake/types.ts";
import type { Route } from "./+types/home";

export function meta(): Route.MetaDescriptors {
  return [{ title: "ファクトチェッカー" }];
}

interface ActionResult {
  readonly turns: readonly IntakeTurn[];
  readonly proposal: ReadyToConfirm | null;
  readonly error: string | null;
}

export async function action({ request }: Route.ActionArgs): Promise<
  ActionResult | Response
> {
  const form = await request.formData();
  // 隠し項目は利用者の手元を通って戻ってくる。型どおりだと決めつけない。
  const turns = parseTurns(form.get("turns"));

  if (form.get("intent") === "confirm") {
    return confirmClaim(turns, form.get("proposal"));
  }

  const message = String(form.get("message") ?? "").trim();
  if (message === "") {
    return { turns, proposal: null, error: "確かめたいことを入力してください。" };
  }

  const nextTurns: IntakeTurn[] = [...turns, { role: "user", text: message }];

  try {
    const reply = await askIntake(getConfig(), nextTurns);

    if (reply.status === "needs_more_info") {
      return {
        turns: [...nextTurns, { role: "assistant", text: reply.question }],
        proposal: null,
        error: null,
      };
    }

    return { turns: nextTurns, proposal: reply, error: null };
  } catch (error) {
    return {
      turns: nextTurns,
      proposal: null,
      // 鍵が足りない・値が不正・呼び出しが失敗した、を区別して見せる。
      error:
        error instanceof MissingConfigError ||
        error instanceof InvalidConfigError ||
        error instanceof IntakeFailedError
          ? error.message
          : "聞き取りの途中で問題が起きました。",
    };
  }
}

const confirmClaim = async (
  turns: readonly IntakeTurn[],
  raw: FormDataEntryValue | null,
): Promise<ActionResult | Response> => {
  const proposal = parseProposal(raw);
  if (proposal === undefined) {
    return {
      turns,
      proposal: null,
      error:
        "確定しようとした内容を読み取れませんでした。お手数ですが、もう一度聞き取りからお願いします。",
    };
  }

  const firstUserTurn = turns.find((turn) => turn.role === "user");

  try {
    const claim = await saveClaim(getDatabase(), {
      originalInput: firstUserTurn?.text ?? "",
      normalizedClaim: proposal.claim,
      searchTerms: {
        support: [...proposal.searchTerms.support],
        refute: [...proposal.searchTerms.refute],
      },
    });
    return redirect(`/claims/${claim.id}`);
  } catch (error) {
    return {
      turns,
      proposal,
      error:
        error instanceof InvalidClaimError
          ? error.message
          : "確定した内容を保存できませんでした。",
    };
  }
};

export default function Home({ actionData }: Route.ComponentProps) {
  const turns = actionData?.turns ?? [];
  const proposal = actionData?.proposal ?? null;
  const error = actionData?.error ?? null;
  const turnsField = JSON.stringify(turns);

  return (
    <main>
      <h1>ファクトチェッカー</h1>
      <p className="note">
        確かめたいことを、思いついたままの言葉で構いません。
        こちらから質問を返して、証拠で確かめられる形に絞り込みます。
      </p>

      {turns.length > 0 && (
        <ol className="turns">
          {turns.map((turn, index) => (
            <li key={`${turn.role}-${index}`} className={turn.role}>
              <span className="who">
                {turn.role === "user" ? "あなた" : "確認"}
              </span>
              <span>{turn.text}</span>
            </li>
          ))}
        </ol>
      )}

      {error !== null && <p className="error">{error}</p>}

      {proposal === null ? (
        <Form method="post">
          <input type="hidden" name="turns" value={turnsField} />
          <label htmlFor="message">
            {turns.length === 0 ? "確かめたいこと" : "答え"}
          </label>
          <textarea
            id="message"
            name="message"
            rows={3}
            required
            placeholder="例: AIって電気めっちゃ使うんでしょ？"
          />
          <button type="submit">送る</button>
        </Form>
      ) : (
        <section className="proposal">
          <h2>この内容で調べますか</h2>
          <blockquote className="claim">{proposal.claim}</blockquote>

          <h3>使う検索語</h3>
          <SearchTermsColumns terms={proposal.searchTerms} headingLevel="h4" />

          <p className="note">
            確定するまで検索は始まりません。確定したあとは、生成AIを呼びません。
          </p>

          <div className="actions">
            <Form method="post">
              <input type="hidden" name="intent" value="confirm" />
              <input type="hidden" name="turns" value={turnsField} />
              <input
                type="hidden"
                name="proposal"
                value={JSON.stringify(proposal)}
              />
              <button type="submit">この内容で確定する</button>
            </Form>

            <Form method="post">
              {/* 何を否定されたのか分かるよう、提案そのものも履歴に残す。 */}
              <input
                type="hidden"
                name="turns"
                value={JSON.stringify([
                  ...turns,
                  { role: "assistant", text: proposal.claim },
                ])}
              />
              <input
                type="hidden"
                name="message"
                value="その主張は違います。もう少し聞いてください。"
              />
              <button type="submit" className="secondary">
                違うので聞き直す
              </button>
            </Form>
          </div>
        </section>
      )}
    </main>
  );
}
