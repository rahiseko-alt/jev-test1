import { loadConfig } from "@factchecker/core/config";
import type { Config } from "@factchecker/core/config";

let cached: Config | undefined;

/** 設定は起動前に確認済み。ここでは読み直さず、一度だけ読んで使い回す。 */
export function getConfig(): Config {
  cached ??= loadConfig(process.env);
  return cached;
}
