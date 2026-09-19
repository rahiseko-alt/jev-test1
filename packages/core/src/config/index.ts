/**
 * 起動時に環境変数を読み、足りないものがあれば「何が足りないか」を挙げて止める。
 *
 * 黙って起動して後から失敗すると、利用者は原因にたどり着けない。
 * 足りない鍵は1つずつではなく、まとめて挙げる。
 */

export const DATABASE_KINDS = ["sqlite", "postgres"] as const;
export type DatabaseKind = (typeof DATABASE_KINDS)[number];

/**
 * 入口の聞き取りに使う生成AIの提供元。ここだけが生成AIを使う。
 *
 * 実装があるものだけを並べる。設定で選べるのに動かない、という状態を作らない。
 * 増やすときは packages/web/app/intake/ に実装を足してから、ここに追加する。
 */
export const INTAKE_PROVIDERS = ["anthropic"] as const;
export type IntakeProvider = (typeof INTAKE_PROVIDERS)[number];

const INTAKE_PROVIDER_SETTINGS = {
  anthropic: { apiKeyEnv: "ANTHROPIC_API_KEY", defaultModel: "claude-opus-5" },
} as const satisfies Record<
  IntakeProvider,
  { apiKeyEnv: string; defaultModel: string }
>;

export const DEFAULT_SQLITE_PATH = "./data/factchecker.db";
export const DEFAULT_INTAKE_PROVIDER: IntakeProvider = "anthropic";

export type DatabaseConfig =
  | { readonly kind: "sqlite"; readonly path: string }
  | { readonly kind: "postgres"; readonly url: string };

export interface IntakeConfig {
  readonly provider: IntakeProvider;
  readonly apiKey: string;
  readonly model: string;
}

export interface Config {
  readonly typesafeApiKey: string;
  readonly tavilyApiKey: string;
  readonly intake: IntakeConfig;
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

const readFromChoices = <Choice extends string>(
  env: Environment,
  key: string,
  choices: readonly Choice[],
  fallback: Choice,
): Choice => {
  const raw = read(env, key);
  if (raw === undefined) return fallback;
  if ((choices as readonly string[]).includes(raw)) return raw as Choice;
  throw new InvalidConfigError(key, `選べるのは ${choices.join(" か ")} です。`);
};

/**
 * 足りない鍵を1つずつ投げずに集める。利用者が .env を何度も往復しないで済むように。
 */
class RequiredValues {
  readonly #env: Environment;
  readonly missing: string[] = [];

  constructor(env: Environment) {
    this.#env = env;
  }

  /** 値があれば返し、無ければ空文字を返して「足りない」側に記録する。 */
  take(key: string): string {
    const value = read(this.#env, key);
    if (value === undefined) {
      this.missing.push(key);
      return "";
    }
    return value;
  }
}

/** 画面やログに出すための、データの置き場所の説明。 */
export function describeDatabase(database: DatabaseConfig): string {
  return database.kind === "sqlite"
    ? `SQLite（${database.path}）`
    : "PostgreSQL";
}

export function loadConfig(env: Environment): Config {
  const required = new RequiredValues(env);

  const typesafeApiKey = required.take("TYPESAFE_API_KEY");
  const tavilyApiKey = required.take("TAVILY_API_KEY");

  const provider = readFromChoices(
    env,
    "INTAKE_PROVIDER",
    INTAKE_PROVIDERS,
    DEFAULT_INTAKE_PROVIDER,
  );
  const providerSettings = INTAKE_PROVIDER_SETTINGS[provider];
  const intake: IntakeConfig = {
    provider,
    apiKey: required.take(providerSettings.apiKeyEnv),
    model: read(env, "INTAKE_MODEL") ?? providerSettings.defaultModel,
  };

  const kind = readFromChoices(
    env,
    "DATABASE_KIND",
    DATABASE_KINDS,
    "sqlite",
  );
  const database: DatabaseConfig =
    kind === "postgres"
      ? { kind: "postgres", url: required.take("DATABASE_URL") }
      : {
          kind: "sqlite",
          path: read(env, "SQLITE_PATH") ?? DEFAULT_SQLITE_PATH,
        };

  if (required.missing.length > 0) {
    throw new MissingConfigError(required.missing);
  }

  const googleFactCheckApiKey = read(env, "GOOGLE_FACTCHECK_API_KEY");
  const crossrefMailto = read(env, "CROSSREF_MAILTO");

  return {
    typesafeApiKey,
    tavilyApiKey,
    intake,
    database,
    ...(googleFactCheckApiKey === undefined ? {} : { googleFactCheckApiKey }),
    ...(crossrefMailto === undefined ? {} : { crossrefMailto }),
  };
}
