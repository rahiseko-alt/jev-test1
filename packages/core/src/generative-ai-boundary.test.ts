/**
 * 「生成AIを呼ぶのは入口の聞き取りだけ」を、置き場所ごと機械的に守る。
 *
 * この検査はリポジトリ全体を見る。前の版は web の app 配下しか見ておらず、
 * 拡張子を変える・別の場所に置く・HTTPで直接叩く、のいずれでもすり抜けた。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

/** 生成AIを呼んでよい唯一の場所。 */
const INTAKE_DIR = join(repoRoot, "packages", "web", "app", "intake");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "build",
  ".react-router",
  "data",
  "dist",
  "coverage",
]);

const CODE_FILE = /\.(m|c)?(t|j)sx?$/;

const GENERATIVE_AI_PACKAGES = [
  "@anthropic-ai/sdk",
  "openai",
  "@google/generative-ai",
  "@ai-sdk/anthropic",
  "@ai-sdk/openai",
  "langchain",
  "@mistralai/mistralai",
  "cohere-ai",
];

/** 生成AIの呼び出し先。取り込みを介さず直接叩く経路も塞ぐ。 */
const GENERATIVE_AI_ENDPOINTS = [
  "api.anthropic.com",
  "api.openai.com",
  "generativelanguage.googleapis.com",
  "api.mistral.ai",
  "api.cohere.ai",
];

const codeFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    if (SKIP_DIRS.has(entry)) return [];
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return codeFiles(path);
    return CODE_FILE.test(entry) ? [path] : [];
  });

/** 取り込み・読み込み・直接の呼び出し先、いずれも見る。 */
const reachesGenerativeAi = (source: string): boolean => {
  const imports = GENERATIVE_AI_PACKAGES.some((name) =>
    new RegExp(
      `(?:from|import\\(|require\\()\\s*["'\`]${name}(?:/|["'\`])`,
    ).test(source),
  );
  const endpoints = GENERATIVE_AI_ENDPOINTS.some((host) =>
    source.includes(host),
  );
  return imports || endpoints;
};

const isInIntake = (file: string): boolean => file.startsWith(INTAKE_DIR + sep);

const allCodeFiles = codeFiles(repoRoot);

describe("生成AIを呼ぶ場所", () => {
  it("検査がリポジトリ全体を見ている（空振りしていない）", () => {
    expect(allCodeFiles.length).toBeGreaterThan(10);
    expect(allCodeFiles.filter(isInIntake).length).toBeGreaterThan(0);
  });

  it("入口の聞き取り以外のどこからも届いていない", () => {
    const offenders = allCodeFiles
      .filter((file) => !isInIntake(file))
      .filter((file) => reachesGenerativeAi(readFileSync(file, "utf8")))
      .map((file) => relative(repoRoot, file))
      // この検査自身は名前を並べるので、対象から外す。
      .filter((file) => !file.endsWith("generative-ai-boundary.test.ts"));

    expect(offenders).toEqual([]);
  });

  it("入口の聞き取りには実際に置かれている", () => {
    const inIntake = allCodeFiles
      .filter(isInIntake)
      .filter((file) => reachesGenerativeAi(readFileSync(file, "utf8")));

    expect(inIntake).not.toEqual([]);
  });

  it("入口の聞き取りが、生成AIの部品をそのまま外へ再輸出していない", () => {
    const leaks = allCodeFiles.filter(isInIntake).filter((file) => {
      const source = readFileSync(file, "utf8");
      return GENERATIVE_AI_PACKAGES.some((name) =>
        new RegExp(`export\\s[^;]*from\\s*["'\`]${name}`).test(source),
      );
    });

    expect(leaks).toEqual([]);
  });
});
