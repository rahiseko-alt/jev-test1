/**
 * 生成AIを呼ぶのは入口の聞き取りだけ、という約束を機械的に守る。
 *
 * 仕様の中心は「確定より後の工程で生成AIを使わない」ことなので、
 * 読み込み場所そのものを検査する。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = join(import.meta.dirname, "..");
const intakeDir = join(appRoot, "intake");

const GENERATIVE_AI_PACKAGES = [
  "@anthropic-ai/sdk",
  "openai",
  "@google/generative-ai",
  "@ai-sdk/anthropic",
  "@ai-sdk/openai",
  "langchain",
];

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(path) ? [path] : [];
  });

const importsGenerativeAi = (file: string): boolean => {
  const source = readFileSync(file, "utf8");
  return GENERATIVE_AI_PACKAGES.some((name) =>
    new RegExp(`(?:from|import\\()\\s*["']${name}(?:/|["'])`).test(source),
  );
};

describe("生成AIを呼ぶ場所", () => {
  it("入口の聞き取り以外のどこからも読み込まれていない", () => {
    const offenders = sourceFiles(appRoot)
      .filter((file) => !file.startsWith(intakeDir + sep))
      .filter(importsGenerativeAi)
      .map((file) => relative(appRoot, file));

    expect(offenders).toEqual([]);
  });

  it("入口の聞き取りには実際に置かれている（検査が空振りしていない）", () => {
    expect(sourceFiles(intakeDir).filter(importsGenerativeAi)).not.toEqual([]);
  });
});
