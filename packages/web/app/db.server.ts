import { createDatabase } from "@factchecker/core";
import type { Database } from "@factchecker/core";
import { getConfig } from "./config.server.ts";

let cached: Database | undefined;

/**
 * 表の用意は起動前（scripts/prepare.ts）に済ませてある。
 *
 * 接続はサーバーの寿命と同じにする。閉じるのはサーバーが終わるときだけなので、
 * ここでは閉じる手順を持たない。PostgreSQL を使う場合も同じで、接続の束は
 * 処理が終わるまで開いたままにする。
 */
export function getDatabase(): Database {
  cached ??= createDatabase(getConfig().database);
  return cached;
}
