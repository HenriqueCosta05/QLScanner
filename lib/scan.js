import { execFileSync } from "child_process";
import { join } from "path";
import { homedir } from "os";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  appendFileSync,
  writeFileSync,
  unlinkSync,
} from "fs";
import chalk from "chalk";
import {
  inferCodeQLLanguageFromFiles,
  resolveCodeQLLanguage,
  getSupportedCodeQLLanguageHelpText,
} from "./codeql-languages.js";

/** Directory where CodeQL stores downloaded query packs. */
const USER_CODEQL_PACKS_DIR = join(homedir(), ".codeql", "packages");

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Runs a full CodeQL security scan against the given repository root.
 *
 * Steps:
 *  1. Prepares the cache directory and `.gitignore` entry.
 *  2. Downloads the required CodeQL query pack.
 *  3. Creates a CodeQL database for the repository.
 *  4. Runs the security analysis and writes results to `codeql-results.md`.
 *
 * @param {string} codeqlPath - Absolute path to the `codeql` binary.
 * @param {string} repoRoot   - Absolute path to the repository root to scan.
 * @param {string|{ language?: string }} [languageOrOptions] - Language name or options object.
 * @returns {Promise<number>} The total number of issues found.
 */
export async function runScan(codeqlPath, repoRoot, languageOrOptions = "javascript") {
  const scanOptions = normalizeScanOptions(languageOrOptions);
  const language = resolveScanLanguage(scanOptions.language, repoRoot);

  ensureGitignoreEntry(repoRoot);

  const cacheDir = join(repoRoot, ".qlscan-cache");
  const dbDir = join(cacheDir, "db");
  mkdirSync(cacheDir, { recursive: true });

  downloadQueryPack(codeqlPath, language);
  createDatabase(codeqlPath, dbDir, repoRoot, language);

  const sarifPath = join(repoRoot, "codeql-results.sarif");
  runAnalysis(codeqlPath, dbDir, sarifPath, language);

  const scanResult = parseSarifResults(sarifPath);
  scanResult.languageLabel = language.label;
  safeUnlink(sarifPath);

  writeMarkdownReport(repoRoot, dbDir, scanResult);
  printSummary(repoRoot, scanResult.total);

  return scanResult.total;
}

// ---------------------------------------------------------------------------
// Scan steps
// ---------------------------------------------------------------------------

/**
 * Downloads the required CodeQL query pack if not already cached.
 * Uses the `codeql pack download` command.
 *
 * @param {string} codeqlPath - Absolute path to the `codeql` binary.
 */
function downloadQueryPack(codeqlPath, language) {
  console.log(chalk.blue(`⬇  Downloading CodeQL query pack for ${language.label}…`));

  try {
    execFileSync(codeqlPath, ["pack", "download", language.queryPack], {
      stdio: "inherit",
      env: { ...process.env, CODEQL_ENABLE_NETWORK_REQUESTS: "true" },
    });
  } catch (err) {
    throw new Error(`Failed to download query pack: ${err.message}`);
  }
}

/**
 * Creates a CodeQL database for the given source root.
 * Always overwrites an existing database.
 *
 * @param {string} codeqlPath - Absolute path to the `codeql` binary.
 * @param {string} dbDir      - Directory where the database will be created.
 * @param {string} sourceRoot - Root of the source tree to analyze.
 */
function createDatabase(codeqlPath, dbDir, sourceRoot, language) {
  console.log(chalk.blue(`🗄  Creating CodeQL database for ${language.label}…`));

  execFileSync(
    codeqlPath,
    [
      "database",
      "create",
      dbDir,
      `--language=${language.databaseLanguage}`,
      "--source-root",
      sourceRoot,
      "--overwrite",
    ],
    { stdio: "inherit" },
  );
}

/**
 * Runs the security analysis against a previously created database.
 * Outputs results in SARIF format.
 *
 * @param {string} codeqlPath - Absolute path to the `codeql` binary.
 * @param {string} dbDir      - Directory of the CodeQL database.
 * @param {string} sarifPath  - Output path for the SARIF results file.
 */
function runAnalysis(codeqlPath, dbDir, sarifPath, language) {
  console.log(chalk.blue(`🔍  Running ${language.label} security analysis…`));

  try {
    execFileSync(
      codeqlPath,
      [
        "database",
        "analyze",
        dbDir,
        "--format=sarif-latest",
        "--output",
        sarifPath,
        "--threads=2",
        "--additional-packs",
        USER_CODEQL_PACKS_DIR,
        language.querySuite,
      ],
      {
        stdio: "inherit",
        env: { ...process.env, CODEQL_ENABLE_NETWORK_REQUESTS: "true" },
      },
    );
  } catch (err) {
    throw new Error(`Analysis failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Result parsing
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ScanIssue
 * @property {string} name        - The rule ID.
 * @property {string} description - Human-readable description.
 * @property {string} severity    - Issue severity level.
 * @property {string} [file]      - Relative file path.
 * @property {number} [line]      - Starting line number.
 */

/**
 * @typedef {Object} ScanResult
 * @property {number}      total   - Total number of issues found.
 * @property {ScanIssue[]} details - Per-issue detail objects.
 */

/**
 * Parses a SARIF file and returns a structured scan result.
 *
 * @param {string} sarifPath - Path to the SARIF JSON file.
 * @returns {ScanResult}
 */
function parseSarifResults(sarifPath) {
  const raw = JSON.parse(readFileSync(sarifPath, "utf8"));
  const results = raw?.runs?.[0]?.results ?? [];

  const details = results.map((result) => ({
    name: result.ruleId ?? "unknown-rule",
    description: result.message?.text ?? "",
    severity: result.level ?? "warning",
    file: result.locations?.[0]?.physicalLocation?.artifactLocation?.uri,
    line: result.locations?.[0]?.physicalLocation?.region?.startLine,
  }));

  return { total: details.length, details };
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

/**
 * Generates and writes the Markdown results report to `codeql-results.md`
 * in the repository root.
 *
 * @param {string}     repoRoot   - Repository root path.
 * @param {string}     dbDir      - CodeQL database directory (included in report).
 * @param {ScanResult} scanResult - Parsed scan results.
 */
function writeMarkdownReport(repoRoot, dbDir, scanResult) {
  const mdPath = join(repoRoot, "codeql-results.md");
  const lines = [
    "# CodeQL Security Scan Results\n",
    "## Summary\n",
    `- **Scan Timestamp:** ${new Date().toISOString()}`,
    `- **Total Issues Found:** ${scanResult.total}\n`,
  ];

  if (scanResult.total > 0) {
    lines.push("## Security Issues Found\n");

    // Group issues by file for readability
    const byFile = groupBy(
      scanResult.details,
      (issue) => issue.file ?? "Unknown Location",
    );

    for (const [file, issues] of Object.entries(byFile)) {
      lines.push(`### ${file}\n`);
      issues.forEach((issue, idx) => {
        lines.push(`${idx + 1}. **${issue.name}**`);
        if (issue.description)
          lines.push(`   - Description: ${issue.description}`);
        if (issue.severity) lines.push(`   - Severity: ${issue.severity}`);
        if (issue.line) lines.push(`   - Line: ${issue.line}`);
        lines.push("");
      });
    }
  } else {
    lines.push(
      "## No Security Issues Found\n",
      "The scan completed successfully with no security issues detected.",
    );
  }

  lines.push(
    "\n## Scan Information\n",
    `- **Scanned Directory:** ${repoRoot}`,
    `- **CodeQL Database:** ${dbDir}`,
    `- **Analysis Type:** ${scanResult.languageLabel ?? "CodeQL"} Security Scan`,
  );

  writeFileSync(mdPath, lines.join("\n"), "utf8");
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Ensures `.qlscan-cache/` is present in the repository's `.gitignore`.
 * Appends the entry if it is missing.
 *
 * @param {string} repoRoot - Repository root path.
 */
function ensureGitignoreEntry(repoRoot) {
  const gitignorePath = join(repoRoot, ".gitignore");
  const entry = ".qlscan-cache/";

  if (existsSync(gitignorePath)) {
    const lines = readFileSync(gitignorePath, "utf8").split(/\r?\n/);
    if (lines.some((line) => line.trim() === entry)) return;
    appendFileSync(gitignorePath, `\n${entry}\n`, "utf8");
  } else {
    writeFileSync(gitignorePath, `${entry}\n`, "utf8");
  }
}

function normalizeScanOptions(languageOrOptions) {
  if (typeof languageOrOptions === "string" || languageOrOptions == null) {
    return { language: languageOrOptions ?? "javascript" };
  }

  return {
    language: languageOrOptions.language ?? "javascript",
  };
}

function resolveScanLanguage(languageInput, repoRoot) {
  const explicitLanguage = resolveCodeQLLanguage(languageInput);
  if (explicitLanguage) return explicitLanguage;

  if (languageInput) {
    throw new Error(
      `Unsupported CodeQL language: ${languageInput}. Supported languages are: ${getSupportedCodeQLLanguageHelpText()}.`,
    );
  }

  const inferredLanguage = inferCodeQLLanguageFromFiles(listTrackedSourceFiles(repoRoot));
  if (inferredLanguage) return inferredLanguage;

  return resolveCodeQLLanguage("javascript");
}

function listTrackedSourceFiles(repoRoot) {
  try {
    const raw = execFileSync("git", ["-C", repoRoot, "ls-files"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return raw.split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Groups an array of items by a string key derived from each item.
 *
 * @template T
 * @param {T[]} items
 * @param {(item: T) => string} keyFn
 * @returns {Record<string, T[]>}
 */
function groupBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    (acc[key] ??= []).push(item);
    return acc;
  }, {});
}

/**
 * Deletes a file without throwing if it does not exist.
 * @param {string} filePath
 */
function safeUnlink(filePath) {
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {
    // Best-effort cleanup.
  }
}

/**
 * Prints the scan summary to the console.
 *
 * @param {string} repoRoot  - Repository root.
 * @param {number} total     - Total number of issues found.
 */
function printSummary(repoRoot, total) {
  const reportPath = join(repoRoot, "codeql-results.md");
  if (total === 0) {
    console.log(chalk.green("✔  No vulnerabilities detected by CodeQL."));
  } else {
    console.log(
      chalk.yellow(`\n⚠  ${total} vulnerability(ies) found by CodeQL.`),
    );
  }
  console.log(chalk.blue(`📄  Detailed report saved to ${reportPath}`));
}
