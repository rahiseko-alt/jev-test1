/**
 * 起動時に環境変数を読み、足りないものがあれば「何が足りないか」を挙げて止める。
 *
 * 黙って起動して後から失敗すると、利用者は原因にたどり着けない。
 * 足りない鍵は1つずつではなく、まとめて挙げる。
 */

export const REQUIRED_KEYS = [
  "TYPESAFE_API_KEY",
  "TAVILY_API_KEY",
  "ANTHROPIC_API_KEY",
] as const;

export const DATABASE_KINDS = ["sqlite", "postgres"] as const;

export type DatabaseKind = (typeof DATABASE_KINDS)[number];

export const DEFAULT_SQLITE_PATH = "./data/factchecker.db";
export const DEFAULT_INTAKE_MODEL = "claude-sonnet-5";

export type DatabaseConfig =
  | { readonly kind: "sqlite"; readonly path: string }
  | { readonly kind: "postgres"; readonly url: string };

export interface Config {
  readonly typesafeApiKey: string;
  readonly tavilyApiKey: string;
  readonly anthropicApiKey: string;
  readonly intakeModel: string;
  readonly database: DatabaseConfig;
  readonly googleFactCheckApiKey?: string;
  readonly crossrefMailto?: string;
}

export type Environment = Readonly<Record<string, string | undefined>>;

/** 必須の設定が足りていないときに投げる。足りないものを全部持つ。 */
export class MissingConfigError extends Error {
  readonly missingKeys: readonly string[];

  constructor(missingKeys: readonly string[]) {
    super(
      [
        "設定が足りないため起動できません。足りないのは次の項目です。",
        ...missingKeys.map((key) => `  - ${key}`),
        "",
        ".env.example を .env としてコピーし、上の項目に値を入れてから起動し直してください。",
      ].join("\n"),
    );
    this.name = "MissingConfigError";
    this.missingKeys = missingKeys;
  }
}

/** 設定されてはいるが、値が受け付けられないときに投げる。 */
export class InvalidConfigError extends Error {
  readonly key: string;

  constructor(key: string, detail: string) {
    super(`${key} の値が正しくありません。${detail}`);
    this.name = "InvalidConfigError";
    this.key = key;
  }
}

/** 空文字と空白だけの値は、未設定として扱う。 */
const read = (env: Environment, key: string): string | undefined => {
  const value = env[key]?.trim();
  return value === undefined || value === "" ? undefined : value;
};

const readDatabaseKind = (env: Environment): DatabaseKind => {
  const raw = read(env, "DATABASE_KIND");
  if (raw === undefined) return "sqlite";
  if ((DATABASE_KINDS as readonly string[]).includes(raw)) {
    return raw as DatabaseKind;
  }
  throw new InvalidConfigError(
    "DATABASE_KIND",
    `選べるのは ${DATABASE_KINDS.join(" か ")} です。`,
  );
};

export function loadConfig(env: Environment): Config {
  const missing: string[] = [];

  const values = new Map<string, string>();
  for (const key of REQUIRED_KEYS) {
    const value = read(env, key);
    if (value === undefined) {
      missing.push(key);
    } else {
      values.set(key, value);
    }
  }

  const kind = readDatabaseKind(env);

  let database: DatabaseConfig | undefined;
  if (kind === "postgres") {
    const url = read(env, "DATABASE_URL");
    if (url === undefined) {
      missing.push("DATABASE_URL");
    } else {
      database = { kind: "postgres", url };
    }
  } else {
    database = {
      kind: "sqlite",
      path: read(env, "SQLITE_PATH") ?? DEFAULT_SQLITE_PATH,
    };
  }

  if (missing.length > 0 || database === undefined) {
    throw new MissingConfigError(missing);
  }

  const googleFactCheckApiKey = read(env, "GOOGLE_FACTCHECK_API_KEY");
  const crossrefMailto = read(env, "CROSSREF_MAILTO");

  return {
    typesafeApiKey: values.get("TYPESAFE_API_KEY") as string,
    tavilyApiKey: values.get("TAVILY_API_KEY") as string,
    anthropicApiKey: values.get("ANTHROPIC_API_KEY") as string,
    intakeModel: read(env, "INTAKE_MODEL") ?? DEFAULT_INTAKE_MODEL,
    database,
    ...(googleFactCheckApiKey === undefined ? {} : { googleFactCheckApiKey }),
    ...(crossrefMailto === undefined ? {} : { crossrefMailto }),
  };
}
