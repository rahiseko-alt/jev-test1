/**
 * core は「確定より後」の工程だけを持つ。
 * 生成AIのクライアントがここに入ると、設計思想（確定後は生成AIを使わない）が
 * 構造として守られなくなるため、依存そのものを禁じる。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = join(import.meta.dirname, "..");

const packageJson = JSON.parse(
  readFileSync(join(packageRoot, "package.json"), "utf8"),
) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const GENERATIVE_AI_PACKAGES = [
  "@anthropic-ai/sdk",
  "openai",
  "@google/generative-ai",
  "@ai-sdk/anthropic",
  "@ai-sdk/openai",
  "ai",
  "langchain",
];

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });

describe("core の境界", () => {
  it("生成AIのクライアントに依存しない", () => {
    const declared = Object.keys({
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    });

    expect(
      declared.filter((name) => GENERATIVE_AI_PACKAGES.includes(name)),
    ).toEqual([]);
  });

  it("画面の側に依存しない", () => {
    const declared = Object.keys({
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    });

    expect(declared.filter((name) => name.startsWith("@factchecker/"))).toEqual(
      [],
    );
  });

  it("どのソースからも生成AIのクライアントを読み込んでいない", () => {
    const offenders = sourceFiles(join(packageRoot, "src")).filter((file) => {
      const source = readFileSync(file, "utf8");
      // `from "pkg"` も `from "pkg/sub"` も 動的な `import("pkg")` も捕まえる。
      return GENERATIVE_AI_PACKAGES.some((name) =>
        new RegExp(`(?:from|import\\()\\s*["']${name}(?:/|["'])`).test(source),
      );
    });

    expect(offenders).toEqual([]);
  });
});
