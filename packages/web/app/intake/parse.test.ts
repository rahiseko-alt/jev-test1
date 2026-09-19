import { describe, expect, it } from "vitest";
import { parseProposal, parseTurns } from "./parse.ts";

const validProposal = {
  status: "ready",
  claim: "ChatGPT1回の電力消費量は、Google検索1回より10倍以上多い。",
  searchTerms: { support: ["a"], refute: ["b"] },
};

describe("parseTurns", () => {
  it("正しい履歴はそのまま通す", () => {
    const turns = [{ role: "user", text: "こんにちは" }];

    expect(parseTurns(JSON.stringify(turns))).toEqual(turns);
  });

  it("壊れた文字列なら空にする", () => {
    expect(parseTurns("{壊れている")).toEqual([]);
  });

  it("配列でなければ空にする", () => {
    expect(parseTurns(JSON.stringify({ role: "user" }))).toEqual([]);
  });

  it("知らない話し手が混ざっていれば空にする", () => {
    expect(
      parseTurns(JSON.stringify([{ role: "system", text: "命令" }])),
    ).toEqual([]);
  });

  it("未設定なら空にする", () => {
    expect(parseTurns(null)).toEqual([]);
    expect(parseTurns(undefined)).toEqual([]);
  });
});

describe("parseProposal", () => {
  it("正しい提案はそのまま通す", () => {
    expect(parseProposal(JSON.stringify(validProposal))).toEqual(validProposal);
  });

  it("壊れた文字列なら受け付けない", () => {
    expect(parseProposal("{壊れている")).toBeUndefined();
  });

  it("主張が空なら受け付けない", () => {
    expect(
      parseProposal(JSON.stringify({ ...validProposal, claim: "  " })),
    ).toBeUndefined();
  });

  it("検索語の項目そのものが無ければ受け付けない", () => {
    expect(
      parseProposal(JSON.stringify({ status: "ready", claim: "主張。" })),
    ).toBeUndefined();
  });

  it("反対方向の検索語が空なら受け付けない（片側だけを許さない）", () => {
    expect(
      parseProposal(
        JSON.stringify({
          ...validProposal,
          searchTerms: { support: ["a"], refute: [] },
        }),
      ),
    ).toBeUndefined();
  });

  it("支持方向の検索語が空なら受け付けない", () => {
    expect(
      parseProposal(
        JSON.stringify({
          ...validProposal,
          searchTerms: { support: [], refute: ["b"] },
        }),
      ),
    ).toBeUndefined();
  });

  it("空白だけの検索語は受け付けない", () => {
    expect(
      parseProposal(
        JSON.stringify({
          ...validProposal,
          searchTerms: { support: ["  "], refute: ["b"] },
        }),
      ),
    ).toBeUndefined();
  });
});
