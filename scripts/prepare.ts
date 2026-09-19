/**
 * 起動前の確認。設定が足りているかを見て、足りなければ何が足りないかを挙げて止める。
 * 足りていればデータベースの表を用意する。
 */
import {
  InvalidConfigError,
  MissingConfigError,
  createDatabase,
  loadConfig,
  migrate,
} from "../packages/core/src/index.ts";

const main = async (): Promise<void> => {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    if (
      error instanceof MissingConfigError ||
      error instanceof InvalidConfigError
    ) {
      console.error(`\n${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  const db = createDatabase(config.database);
  try {
    await migrate(db);
    const kind = config.database.kind;
    const where =
      config.database.kind === "sqlite" ? config.database.path : "PostgreSQL";
    console.log(`データベースの準備ができました（${kind}: ${where}）。`);
  } finally {
    await db.close();
  }
};

await main();
