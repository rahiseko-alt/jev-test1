import { describe, expect, it } from "vitest";
import { MissingConfigError, describeDatabase, loadConfig } from "./index.ts";

const withRequired = (extra: Record<string, string | undefined> = {}) => ({
  TYPESAFE_API_KEY: "ts-key",
  TAVILY_API_KEY: "tv-key",
  ANTHROPIC_API_KEY: "an-key",
  ...extra,
});

describe("describeDatabase", () => {
  it("SQLiteはファイルの場所まで示す", () => {
    expect(describeDatabase({ kind: "sqlite", path: "./data/x.db" })).toBe(
      "SQLite（./data/x.db）",
    );
  });

  it("PostgreSQLは接続先を出さない", () => {
    const description = describeDatabase({
      kind: "postgres",
      url: "postgres://user:pw@localhost:5432/fc",
    });

    expect(description).toBe("PostgreSQL");
    expect(description).not.toContain("pw");
  });
});

describe("loadConfig", () => {
  it("既定ではSQLiteを使い、既定のファイル置き場を返す", () => {
    const config = loadConfig(withRequired());

    expect(config.database).toEqual({
      kind: "sqlite",
      path: "./data/factchecker.db",
    });
  });

  it("必須の鍵が足りないとき、足りないものを全部挙げて止まる", () => {
    let thrown: unknown;
    try {
      loadConfig({});
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(MissingConfigError);
    const error = thrown as MissingConfigError;
    expect(error.missingKeys).toEqual([
      "TYPESAFE_API_KEY",
      "TAVILY_API_KEY",
      "ANTHROPIC_API_KEY",
    ]);
  });

  it("足りない鍵が1つでも、その名前を挙げて止まる", () => {
    expect(() => loadConfig(withRequired({ TAVILY_API_KEY: "" }))).toThrowError(
      /TAVILY_API_KEY/,
    );
  });

  it("空白だけの値は未設定として扱う", () => {
    let thrown: unknown;
    try {
      loadConfig(withRequired({ TYPESAFE_API_KEY: "   " }));
    } catch (error) {
      thrown = error;
    }

    expect((thrown as MissingConfigError).missingKeys).toEqual([
      "TYPESAFE_API_KEY",
    ]);
  });

  it("エラーの本文に、足りない鍵の名前と対処が書かれている", () => {
    let thrown: unknown;
    try {
      loadConfig({});
    } catch (error) {
      thrown = error;
    }

    const message = (thrown as MissingConfigError).message;
    expect(message).toContain("TYPESAFE_API_KEY");
    expect(message).toContain("TAVILY_API_KEY");
    expect(message).toContain("ANTHROPIC_API_KEY");
    expect(message).toContain(".env");
  });

  it("PostgreSQLを選んだときは接続先が必須になる", () => {
    let thrown: unknown;
    try {
      loadConfig(withRequired({ DATABASE_KIND: "postgres" }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(MissingConfigError);
    expect((thrown as MissingConfigError).missingKeys).toEqual(["DATABASE_URL"]);
  });

  it("PostgreSQLの接続先があれば読み込める", () => {
    const config = loadConfig(
      withRequired({
        DATABASE_KIND: "postgres",
        DATABASE_URL: "postgres://user:pw@localhost:5432/fc",
      }),
    );

    expect(config.database).toEqual({
      kind: "postgres",
      url: "postgres://user:pw@localhost:5432/fc",
    });
  });

  it("知らないデータベースの種類は、選べる値を挙げて止まる", () => {
    expect(() =>
      loadConfig(withRequired({ DATABASE_KIND: "mysql" })),
    ).toThrowError(/sqlite/);
  });

  it("任意の設定は、未設定なら undefined になる", () => {
    const config = loadConfig(withRequired());

    expect(config.googleFactCheckApiKey).toBeUndefined();
    expect(config.crossrefMailto).toBeUndefined();
  });

  it("任意の設定は、設定されていれば読み込まれる", () => {
    const config = loadConfig(
      withRequired({
        GOOGLE_FACTCHECK_API_KEY: "g-key",
        CROSSREF_MAILTO: "me@example.com",
      }),
    );

    expect(config.googleFactCheckApiKey).toBe("g-key");
    expect(config.crossrefMailto).toBe("me@example.com");
  });

  it("入口の聞き取りは、既定ではClaudeを使う", () => {
    expect(loadConfig(withRequired()).intake).toEqual({
      provider: "anthropic",
      apiKey: "an-key",
      model: "claude-opus-5",
    });
  });

  it("入口の聞き取りの提供元を切り替えられる", () => {
    const config = loadConfig({
      TYPESAFE_API_KEY: "ts-key",
      TAVILY_API_KEY: "tv-key",
      INTAKE_PROVIDER: "openai",
      OPENAI_API_KEY: "oa-key",
    });

    expect(config.intake.provider).toBe("openai");
    expect(config.intake.apiKey).toBe("oa-key");
  });

  it("提供元を切り替えたら、必要な鍵もその提供元のものになる", () => {
    let thrown: unknown;
    try {
      loadConfig({
        TYPESAFE_API_KEY: "ts-key",
        TAVILY_API_KEY: "tv-key",
        INTAKE_PROVIDER: "openai",
        ANTHROPIC_API_KEY: "an-key",
      });
    } catch (error) {
      thrown = error;
    }

    expect((thrown as MissingConfigError).missingKeys).toEqual([
      "OPENAI_API_KEY",
    ]);
  });

  it("知らない提供元は、選べる値を挙げて止まる", () => {
    expect(() =>
      loadConfig(withRequired({ INTAKE_PROVIDER: "gemini" })),
    ).toThrowError(/anthropic/);
  });

  it("使うモデルを指定できる", () => {
    expect(
      loadConfig(withRequired({ INTAKE_MODEL: "claude-opus-5" })).intake.model,
    ).toBe("claude-opus-5");
  });
});
