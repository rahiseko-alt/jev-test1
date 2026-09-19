/** 画面から戻ってきた値を、使える形に直す。壊れていれば undefined を返す。 */

import type { IntakeTurn, ReadyToConfirm } from "./types.ts";
import { IntakeTurnsSchema, ReadyToConfirmSchema } from "./types.ts";

const parseJson = (raw: unknown): unknown => {
  if (typeof raw !== "string" || raw === "") return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
};

/** 壊れた履歴は、無かったことにして最初からやり直せるようにする。 */
export function parseTurns(raw: unknown): IntakeTurn[] {
  const result = IntakeTurnsSchema.safeParse(parseJson(raw));
  return result.success ? result.data : [];
}

/** 壊れた提案は、そのまま保存させない。 */
export function parseProposal(raw: unknown): ReadyToConfirm | undefined {
  const result = ReadyToConfirmSchema.safeParse(parseJson(raw));
  return result.success ? result.data : undefined;
}
