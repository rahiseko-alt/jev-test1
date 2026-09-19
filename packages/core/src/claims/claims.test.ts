import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, migrate } from "../db/index.ts";
import type { Database } from "../db/index.ts";
import {
  CorruptClaimError,
  InvalidClaimError,
  getClaim,
  saveClaim,
} from "./index.ts";

const opened: Database[] = [];

const openDatabase = async (): Promise<Database> => {
  const db = createDatabase({ kind: "sqlite", path: ":memory:" });
  opened.push(db);
  await migrate(db);
  return db;
};

afterEach(async () => {
  while (opened.length > 0) await opened.pop()?.close();
});

const validInput = {
  originalInput: "AIって電気めっちゃ使うんでしょ？",
  normalizedClaim:
    "ChatGPTを1回利用したときの電力消費量は、Google検索1回より10倍以上多い。",
  searchTerms: {
    support: ["ChatGPT 消費電力 1回", "生成AI 電力 Google検索 比較"],
    refute: ["ChatGPT 消費電力 過大評価", "生成AI 電力 誤り 訂正"],
  },
};

describe("saveClaim", () => {
  it("確定した主張を保存し、読み戻せる", async () => {
    const db = await openDatabase();

    const saved = await saveClaim(db, validInput);
    const found = await getClaim(db, saved.id);

    expect(found?.normalizedClaim).toBe(validInput.normalizedClaim);
    expect(found?.originalInput).toBe(validInput.originalInput);
  });

  it("検索語を、支持方向と反対方向に分けたまま保存する", async () => {
    const db = await openDatabase();

    const saved = await saveClaim(db, validInput);
    const found = await getClaim(db, saved.id);

    expect(found?.searchTerms).toEqual(validInput.searchTerms);
  });

  it("保存した主張は、証拠を集める前の状態になる", async () => {
    const db = await openDatabase();

    expect((await saveClaim(db, validInput)).status).toBe("collecting");
  });

  it("識別子と作成日時が付く", async () => {
    const db = await openDatabase();

    const saved = await saveClaim(db, validInput);

    expect(saved.id).not.toBe("");
    expect(Date.parse(saved.createdAt)).not.toBeNaN();
  });

  it("保存するたびに別の識別子になる", async () => {
    const db = await openDatabase();

    const first = await saveClaim(db, validInput);
    const second = await saveClaim(db, validInput);

    expect(first.id).not.toBe(second.id);
  });

  it("引用符を含む入力でも壊れない", async () => {
    const db = await openDatabase();

    const saved = await saveClaim(db, {
      ...validInput,
      originalInput: "それ'本当'なの？",
    });

    expect((await getClaim(db, saved.id))?.originalInput).toBe("それ'本当'なの？");
  });
});

describe("saveClaim が受け付けないもの", () => {
  it("主張が空", async () => {
    const db = await openDatabase();

    await expect(
      saveClaim(db, { ...validInput, normalizedClaim: "   " }),
    ).rejects.toBeInstanceOf(InvalidClaimError);
  });

  it("支持方向の検索語が無い", async () => {
    const db = await openDatabase();

    await expect(
      saveClaim(db, {
        ...validInput,
        searchTerms: { support: [], refute: ["a"] },
      }),
    ).rejects.toThrowError(/支持/);
  });

  it("反対方向の検索語が無い（片側だけで調べることを許さない）", async () => {
    const db = await openDatabase();

    await expect(
      saveClaim(db, {
        ...validInput,
        searchTerms: { support: ["a"], refute: [] },
      }),
    ).rejects.toThrowError(/反対/);
  });

  it("空白だけの検索語は数えない", async () => {
    const db = await openDatabase();

    await expect(
      saveClaim(db, {
        ...validInput,
        searchTerms: { support: ["  "], refute: ["a"] },
      }),
    ).rejects.toThrowError(/支持/);
  });
});

describe("getClaim", () => {
  it("知らない識別子なら undefined", async () => {
    expect(await getClaim(await openDatabase(), "missing")).toBeUndefined();
  });
});

describe("壊れた保存内容", () => {
  it("知らない状態なら、読み取り時に気づく", async () => {
    const db = await openDatabase();
    const saved = await saveClaim(db, validInput);
    await db.run("UPDATE claims SET status = ? WHERE id = ?", ["謎", saved.id]);

    await expect(getClaim(db, saved.id)).rejects.toBeInstanceOf(
      CorruptClaimError,
    );
  });

  it("検索語が壊れていれば、読み取り時に気づく", async () => {
    const db = await openDatabase();
    const saved = await saveClaim(db, validInput);
    await db.run("UPDATE claims SET search_terms = ? WHERE id = ?", [
      "{壊れている",
      saved.id,
    ]);

    await expect(getClaim(db, saved.id)).rejects.toThrowError(/検索語/);
  });

  it("片側の検索語しか無ければ、読み取り時に気づく", async () => {
    const db = await openDatabase();
    const saved = await saveClaim(db, validInput);
    await db.run("UPDATE claims SET search_terms = ? WHERE id = ?", [
      JSON.stringify({ support: ["a"] }),
      saved.id,
    ]);

    await expect(getClaim(db, saved.id)).rejects.toThrowError(/反対方向/);
  });
});
