import test from "node:test";
import assert from "node:assert/strict";

import {
  getSupportedExtensionPattern,
  getSupportedLanguageLabels,
  inferLanguageFromFilePaths,
  resolveLanguageConfig,
} from "../lib/languages.js";

test("resolves aliases to canonical language configuration", () => {
  const js = resolveLanguageConfig("typescript");
  assert.equal(js.name, "javascript");
  assert.equal(js.databaseLanguage, "javascript");

  const cpp = resolveLanguageConfig("c++");
  assert.equal(cpp.name, "cpp");
  assert.equal(cpp.databaseLanguage, "cpp");
});

test("throws for unsupported languages", () => {
  assert.throws(() => resolveLanguageConfig("elixir"), /Unsupported language/);
});

test("infers dominant language from tracked file paths", () => {
  const inferred = inferLanguageFromFilePaths([
    "src/app.ts",
    "src/server.ts",
    "src/main.py",
  ]);
  assert.equal(inferred, "javascript");
});

test("supported file extension pattern matches expected extensions", () => {
  const pattern = getSupportedExtensionPattern();
  assert.equal(pattern.test("foo.rb"), true);
  assert.equal(pattern.test("bar.swift"), true);
  assert.equal(pattern.test("README.md"), false);
});

test("supported language labels include required set", () => {
  const labels = getSupportedLanguageLabels();
  assert.deepEqual(labels, [
    "C/C++",
    "C#",
    "Go",
    "Java",
    "JavaScript/TypeScript",
    "Python",
    "Ruby",
    "Swift",
  ]);
});
