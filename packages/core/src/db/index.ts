/**
 * データベースへの接続と、表の作成。
 *
 * SQLite と PostgreSQL の両方を扱う。既定は SQLite で、ファイル1つで動くため
 * 利用者が試すまでの手数が少ない。複数人で使う場合は PostgreSQL に切り替える。
 *
 * 値は必ず `?` の場所に渡す。SQL の文字列に値を差し込まない。
 * PostgreSQL 側では `?` を `$1` の形に置き換えてから渡す。
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

export type SqlParameter = string | number | boolean | null;

export interface Database {
  readonly kind: DatabaseKind;
  /** 値を差し込まないSQLを実行する。複数の文を `;` で区切って渡してよい。 */
  execute(sql: string): Promise<void>;
  /** 値を差し込む、値を返さないSQLを1文だけ実行する。 */
  run(sql: string, params?: readonly SqlParameter[]): Promise<void>;
  /** 値を返すSQLを1文だけ実行する。 */
  query<Row>(sql: string, params?: readonly SqlParameter[]): Promise<Row[]>;
  /** 中の処理をひとまとまりにする。途中で失敗したら全部取り消す。 */
  transaction<Result>(body: () => Promise<Result>): Promise<Result>;
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
 *
 * 表の作成と「適用した」という記録は、必ず一緒に成功するか一緒に取り消される。
 * 片方だけが残ると、次の実行で必ず失敗する状態になってしまうため。
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

    await db.transaction(async () => {
      await db.execute(migration.sql);
      await db.run(
        `INSERT INTO ${MIGRATIONS_TABLE} (name, applied_at) VALUES (?, ?)`,
        [migration.name, new Date().toISOString()],
      );
    });
  }
}

const APPLIED_MIGRATIONS_SQL = `SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY applied_at, name`;

const createSqliteDatabase = (path: string): Database => {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const connection = new BetterSqlite3(path);
  connection.pragma("foreign_keys = ON");

  const db: Database = {
    kind: "sqlite",
    async execute(sql) {
      connection.exec(sql);
    },
    async run(sql, params = []) {
      connection.prepare(sql).run(...(params as SqlParameter[]));
    },
    async query<Row>(sql: string, params: readonly SqlParameter[] = []) {
      return connection.prepare(sql).all(...(params as SqlParameter[])) as Row[];
    },
    async transaction(body) {
      connection.exec("BEGIN");
      try {
        const result = await body();
        connection.exec("COMMIT");
        return result;
      } catch (error) {
        connection.exec("ROLLBACK");
        throw error;
      }
    },
    async listTableNames() {
      const rows = await db.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      );
      return rows.map((row) => row.name);
    },
    async listAppliedMigrations() {
      const existing = await db.query(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        [MIGRATIONS_TABLE],
      );
      if (existing.length === 0) return [];
      const rows = await db.query<{ name: string }>(APPLIED_MIGRATIONS_SQL);
      return rows.map((row) => row.name);
    },
    async close() {
      connection.close();
    },
  };

  return db;
};

/** `?` を PostgreSQL の `$1`, `$2` … に置き換える。 */
const toPostgresPlaceholders = (sql: string): string => {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
};

const createPostgresDatabase = (url: string): Database => {
  const pool = new pg.Pool({ connectionString: url });
  // ひとまとまりの処理の間は、同じ接続を使い続ける必要がある。
  let activeClient: pg.PoolClient | undefined;

  const run = async (sql: string, params: readonly SqlParameter[]) => {
    const executor = activeClient ?? pool;
    return executor.query(
      params.length === 0 ? sql : toPostgresPlaceholders(sql),
      params as SqlParameter[],
    );
  };

  const db: Database = {
    kind: "postgres",
    async execute(sql) {
      await run(sql, []);
    },
    async run(sql, params = []) {
      await run(sql, params);
    },
    async query<Row>(sql: string, params: readonly SqlParameter[] = []) {
      const result = await run(sql, params);
      return result.rows as Row[];
    },
    async transaction(body) {
      if (activeClient !== undefined) return body();

      const client = await pool.connect();
      activeClient = client;
      try {
        await client.query("BEGIN");
        const result = await body();
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        activeClient = undefined;
        client.release();
      }
    },
    async listTableNames() {
      const rows = await db.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = ANY (current_schemas(false)) ORDER BY table_name`,
      );
      return rows.map((row) => row.table_name);
    },
    async listAppliedMigrations() {
      const [existing] = await db.query<{ table_ref: string | null }>(
        "SELECT to_regclass(?) AS table_ref",
        [MIGRATIONS_TABLE],
      );
      if (existing?.table_ref == null) return [];
      const rows = await db.query<{ name: string }>(APPLIED_MIGRATIONS_SQL);
      return rows.map((row) => row.name);
    },
    async close() {
      await pool.end();
    },
  };

  return db;
};

export function createDatabase(config: DatabaseConfig): Database {
  return config.kind === "sqlite"
    ? createSqliteDatabase(config.path)
    : createPostgresDatabase(config.url);
}
