import { saveClaim } from "@factchecker/core";
import { Form, redirect } from "react-router";
import { getConfig } from "../config.server.ts";
import { getDatabase } from "../db.server.ts";
import { IntakeFailedError, askIntake } from "../intake/intake.server.ts";
import type { IntakeTurn, ReadyToConfirm } from "../intake/types.ts";
import type { Route } from "./+types/home";

export function meta(): Route.MetaDescriptors {
  return [{ title: "ファクトチェッカー" }];
}

/** やり取りの履歴は、画面の隠し項目に入れて持ち回る。 */
const readTurns = (raw: FormDataEntryValue | null): IntakeTurn[] => {
  if (typeof raw !== "string" || raw === "") return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (turn): turn is IntakeTurn =>
      typeof turn === "object" &&
      turn !== null &&
      (turn as IntakeTurn).role !== undefined &&
      typeof (turn as IntakeTurn).text === "string",
  );
};

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const turns = readTurns(form.get("turns"));

  if (form.get("intent") === "confirm") {
    const proposal: unknown = JSON.parse(String(form.get("proposal")));
    const ready = proposal as ReadyToConfirm;

    const claim = await saveClaim(getDatabase(), {
      originalInput: turns[0]?.text ?? "",
      normalizedClaim: ready.claim,
      searchTerms: {
        support: [...ready.searchTerms.support],
        refute: [...ready.searchTerms.refute],
      },
    });

    return redirect(`/claims/${claim.id}`);
  }

  const message = String(form.get("message") ?? "").trim();
  if (message === "") {
    return { turns, error: "確かめたいことを入力してください。" } as const;
  }

  const nextTurns: IntakeTurn[] = [...turns, { role: "user", text: message }];

  try {
    const reply = await askIntake(getConfig(), nextTurns);

    if (reply.status === "needs_more_info") {
      return {
        turns: [
          ...nextTurns,
          { role: "assistant", text: reply.question },
        ] as IntakeTurn[],
        proposal: null,
        error: null,
      } as const;
    }

    return { turns: nextTurns, proposal: reply, error: null } as const;
  } catch (error) {
    return {
      turns: nextTurns,
      proposal: null,
      error:
        error instanceof IntakeFailedError
          ? error.message
          : "聞き取りの途中で問題が起きました。",
    } as const;
  }
}

export default function Home({ actionData }: Route.ComponentProps) {
  const turns = actionData?.turns ?? [];
  const proposal = actionData && "proposal" in actionData ? actionData.proposal : null;
  const error = actionData?.error ?? null;

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
          <input type="hidden" name="turns" value={JSON.stringify(turns)} />
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
          <div className="columns">
            <section>
              <h4>支持する材料を探す</h4>
              <ul>
                {proposal.searchTerms.support.map((term) => (
                  <li key={term}>{term}</li>
                ))}
              </ul>
            </section>
            <section>
              <h4>反対する材料を探す</h4>
              <ul>
                {proposal.searchTerms.refute.map((term) => (
                  <li key={term}>{term}</li>
                ))}
              </ul>
            </section>
          </div>

          <p className="note">
            確定するまで検索は始まりません。確定したあとは、生成AIを呼びません。
          </p>

          <div className="actions">
            <Form method="post">
              <input type="hidden" name="intent" value="confirm" />
              <input type="hidden" name="turns" value={JSON.stringify(turns)} />
              <input
                type="hidden"
                name="proposal"
                value={JSON.stringify(proposal)}
              />
              <button type="submit">この内容で確定する</button>
            </Form>

            <Form method="post">
              <input type="hidden" name="turns" value={JSON.stringify(turns)} />
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
