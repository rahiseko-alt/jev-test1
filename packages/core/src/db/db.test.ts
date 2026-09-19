import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DATA_MODEL_TABLES,
  createDatabase,
  migrate,
  toPostgresPlaceholders,
} from "./index.ts";
import type { Database } from "./index.ts";

const migrationsDir = join(import.meta.dirname, "migrations");

/** CREATE TABLE 文から、表の名前と列の名前だけを取り出す。 */
const readTableShapes = (dialect: "sqlite" | "postgres") => {
  const sql = readFileSync(join(migrationsDir, dialect, "0001_init.sql"), "utf8");
  const shapes = new Map<string, string[]>();
  for (const [, table, body] of sql.matchAll(/CREATE TABLE (\w+) \(([\s\S]*?)\n\);/g)) {
    const columns = (body ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.split(/\s+/)[0] ?? "");
    shapes.set(table ?? "", columns);
  }
  return shapes;
};

const opened: Database[] = [];

const openMemoryDatabase = (): Database => {
  const db = createDatabase({ kind: "sqlite", path: ":memory:" });
  opened.push(db);
  return db;
};

afterEach(async () => {
  while (opened.length > 0) await opened.pop()?.close();
});

describe("migrate", () => {
  it("データモデルの表を全部作る", async () => {
    const db = openMemoryDatabase();

    await migrate(db);

    const tables = await db.listTableNames();
    for (const table of DATA_MODEL_TABLES) {
      expect(tables).toContain(table);
    }
  });

  it("2回実行しても壊れない", async () => {
    const db = openMemoryDatabase();

    await migrate(db);
    await expect(migrate(db)).resolves.not.toThrow();
    expect(await db.listTableNames()).toContain("claims");
  });

  it("適用済みの移行を記録する", async () => {
    const db = openMemoryDatabase();

    await migrate(db);

    expect(await db.listAppliedMigrations()).toEqual(["0001_init"]);
  });

  it("移行のあと、主張を保存して読み戻せる", async () => {
    const db = openMemoryDatabase();
    await migrate(db);

    await db.execute(`
      INSERT INTO claims (id, original_input, normalized_claim, search_terms, status, created_at)
      VALUES ('claim-1', 'AIって電気めっちゃ使うんでしょ？', 'ChatGPTを1回利用したときの電力消費量は、Google検索1回より10倍以上多い。', '{}', 'collecting', '2026-09-19T00:00:00.000Z')
    `);

    const rows = await db.query<{ normalized_claim: string }>(
      "SELECT normalized_claim FROM claims",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.normalized_claim).toContain("ChatGPT");
  });
});

describe("値の差し込み", () => {
  it("値はSQLの文字列に混ぜず、差し込みで渡せる", async () => {
    const db = openMemoryDatabase();
    await migrate(db);

    // 引用符を含む値でも壊れないこと。
    await db.run(
      `INSERT INTO claims (id, original_input, normalized_claim, search_terms, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ["c-1", "it's a test", "主張", "{}", "collecting", "2026-09-19T00:00:00.000Z"],
    );

    const rows = await db.query<{ original_input: string }>(
      "SELECT original_input FROM claims WHERE id = ?",
      ["c-1"],
    );
    expect(rows[0]?.original_input).toBe("it's a test");
  });
});

describe("ひとまとまりの処理", () => {
  it("途中で失敗したら、その中の変更は全部取り消される", async () => {
    const db = openMemoryDatabase();
    await migrate(db);

    await expect(
      db.transaction(async () => {
        await db.run(
          `INSERT INTO claims (id, original_input, normalized_claim, search_terms, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          ["c-2", "入力", "主張", "{}", "collecting", "2026-09-19T00:00:00.000Z"],
        );
        throw new Error("途中で失敗");
      }),
    ).rejects.toThrow("途中で失敗");

    expect(await db.query("SELECT id FROM claims")).toEqual([]);
  });

  it("最後まで通れば、その中の変更は残る", async () => {
    const db = openMemoryDatabase();
    await migrate(db);

    await db.transaction(async () => {
      await db.run(
        `INSERT INTO claims (id, original_input, normalized_claim, search_terms, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ["c-3", "入力", "主張", "{}", "collecting", "2026-09-19T00:00:00.000Z"],
      );
    });

    expect(await db.query("SELECT id FROM claims")).toHaveLength(1);
  });
});

describe("2つのデータベースの定義", () => {
  it("同じ表を持つ", () => {
    expect([...readTableShapes("postgres").keys()].sort()).toEqual(
      [...readTableShapes("sqlite").keys()].sort(),
    );
  });

  it("表ごとに同じ列を持つ", () => {
    const postgres = readTableShapes("postgres");

    for (const [table, columns] of readTableShapes("sqlite")) {
      expect(postgres.get(table), `${table} が postgres 側に無い`).toEqual(columns);
    }
  });

  it("設計文書に挙げた表を過不足なく定義している", () => {
    expect([...readTableShapes("sqlite").keys()].sort()).toEqual(
      [...DATA_MODEL_TABLES].sort(),
    );
  });
});

describe("PostgreSQL 向けの差し込み記号", () => {
  it("? を順番に $1, $2 … へ置き換える", () => {
    expect(
      toPostgresPlaceholders("INSERT INTO t (a, b, c) VALUES (?, ?, ?)"),
    ).toBe("INSERT INTO t (a, b, c) VALUES ($1, $2, $3)");
  });

  it("差し込みが無いSQLはそのまま", () => {
    expect(toPostgresPlaceholders("SELECT 1")).toBe("SELECT 1");
  });

  it("移行の記録に使うSQLも置き換えられる", () => {
    expect(
      toPostgresPlaceholders(
        "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
      ),
    ).toBe("INSERT INTO schema_migrations (name, applied_at) VALUES ($1, $2)");
  });
});
