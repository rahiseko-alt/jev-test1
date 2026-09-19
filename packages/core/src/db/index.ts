/**
 * データベースへの接続と、表の作成。
 *
 * SQLite と PostgreSQL の両方を扱う。既定は SQLite で、ファイル1つで動くため
 * 利用者が試すまでの手数が少ない。複数人で使う場合は PostgreSQL に切り替える。
 *
 * ここでは値を差し込む問い合わせ（プレースホルダ）を提供しない。利用者の入力を
 * データベースへ渡す処理は、値の差し込みを含む取り出し・保存の層と一緒に
 * 次のチケットで作る。
 */

import BetterSqlite3 from "better-sqlite3";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import pg from "pg";
import type { DatabaseConfig, DatabaseKind } from "../config/index.ts";

/** 設計文書（docs/design/04-architecture.md）に挙げた表。 */
export const DATA_MODEL_TABLES = [
  "claims",
  "evidence",
  "evidence_chunks",
  "evidence_judgements",
  "quality_checks",
  "investigation_branches",
  "verdicts",
] as const;

const MIGRATIONS_TABLE = "schema_migrations";

export interface Database {
  readonly kind: DatabaseKind;
  /** 値を返さないSQLを実行する。複数文を `;` で区切って渡してよい。 */
  execute(sql: string): Promise<void>;
  /** 値を返すSQLを実行する。 */
  query<Row>(sql: string): Promise<Row[]>;
  /** いま存在する表の名前。 */
  listTableNames(): Promise<string[]>;
  /** 適用済みの移行の名前。適用した順。 */
  listAppliedMigrations(): Promise<string[]>;
  close(): Promise<void>;
}

const migrationsRoot = join(import.meta.dirname, "migrations");

interface Migration {
  readonly name: string;
  readonly sql: string;
}

/** その種類のデータベース向けの移行を、名前の順に読む。 */
export function readMigrations(kind: DatabaseKind): Migration[] {
  const dir = join(migrationsRoot, kind);
  return readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({
      name: file.replace(/\.sql$/, ""),
      sql: readFileSync(join(dir, file), "utf8"),
    }));
}

/**
 * 未適用の移行だけを適用する。適用済みのものは飛ばすので、何度実行してもよい。
 */
export async function migrate(db: Database): Promise<void> {
  await db.execute(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
       name TEXT PRIMARY KEY NOT NULL,
       applied_at TEXT NOT NULL
     )`,
  );

  const applied = new Set(await db.listAppliedMigrations());

  for (const migration of readMigrations(db.kind)) {
    if (applied.has(migration.name)) continue;
    await db.execute(migration.sql);
    await db.execute(
      `INSERT INTO ${MIGRATIONS_TABLE} (name, applied_at)
       VALUES ('${migration.name}', '${new Date().toISOString()}')`,
    );
  }
}

const createSqliteDatabase = (path: string): Database => {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const connection = new BetterSqlite3(path);
  connection.pragma("foreign_keys = ON");

  return {
    kind: "sqlite",
    async execute(sql) {
      connection.exec(sql);
    },
    async query<Row>(sql: string) {
      return connection.prepare(sql).all() as Row[];
    },
    async listTableNames() {
      const rows = connection
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        )
        .all() as Array<{ name: string }>;
      return rows.map((row) => row.name);
    },
    async listAppliedMigrations() {
      const exists = connection
        .prepare(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${MIGRATIONS_TABLE}'`,
        )
        .get();
      if (exists === undefined) return [];
      const rows = connection
        .prepare(`SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY name`)
        .all() as Array<{ name: string }>;
      return rows.map((row) => row.name);
    },
    async close() {
      connection.close();
    },
  };
};

const createPostgresDatabase = (url: string): Database => {
  const pool = new pg.Pool({ connectionString: url });

  return {
    kind: "postgres",
    async execute(sql) {
      await pool.query(sql);
    },
    async query<Row>(sql: string) {
      const result = await pool.query(sql);
      return result.rows as Row[];
    },
    async listTableNames() {
      const result = await pool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' ORDER BY table_name`,
      );
      return result.rows.map((row) => row.table_name);
    },
    async listAppliedMigrations() {
      const exists = await pool.query(
        `SELECT to_regclass('public.${MIGRATIONS_TABLE}') AS table_ref`,
      );
      if (exists.rows[0]?.table_ref === null) return [];
      const result = await pool.query<{ name: string }>(
        `SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY name`,
      );
      return result.rows.map((row) => row.name);
    },
    async close() {
      await pool.end();
    },
  };
};

export function createDatabase(config: DatabaseConfig): Database {
  return config.kind === "sqlite"
    ? createSqliteDatabase(config.path)
    : createPostgresDatabase(config.url);
}
