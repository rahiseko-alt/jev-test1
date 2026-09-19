import { createDatabase } from "@factchecker/core";
import type { Database } from "@factchecker/core";
import { getConfig } from "./config.server.ts";

let cached: Database | undefined;

/** 表の用意は起動前（scripts/prepare.ts）に済ませてある。 */
export function getDatabase(): Database {
  cached ??= createDatabase(getConfig().database);
  return cached;
}
