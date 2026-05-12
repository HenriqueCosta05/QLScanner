import { execFileSync } from "child_process";
import { resolve, join, isAbsolute, dirname } from "path";
import { homedir } from "os";
import {
  mkdirSync,
  existsSync,
  statSync,
  readFileSync,
  appendFileSync,
  writeFileSync,
  unlinkSync,
} from "fs";
import chalk from "chalk";

import { getLanguageProfile } from "./scan-profiles.js";

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
 * @param {object} [options]
 * @param {string} [options.language] - Primary language to scan.
 * @returns {Promise<{ total: number, details: ScanFinding[] }>}
 */
export async function runScan(codeqlPath, repoRoot, options = {}) {
  const languageProfile = getLanguageProfile(options.language ?? "javascript");

  if (!languageProfile) {
    throw new Error(
      `Unsupported language: ${options.language}. Choose one of: javascript, python, java, csharp, go.`,
    );
  }

  const customQueries = normalizeCustomQueries(
    repoRoot,
    options.customQueries ?? options.queries,
  );
  const customQueriesMode = normalizeCustomQueriesMode(
    options.customQueriesMode ?? options.queriesMode,
  );

  ensureGitignoreEntry(repoRoot);

  const cacheDir = join(repoRoot, ".qlscan-cache");
  const dbDir = join(cacheDir, "db");
  mkdirSync(cacheDir, { recursive: true });

  downloadQueryPack(codeqlPath, languageProfile.queryPack);
  createDatabase(codeqlPath, dbDir, repoRoot, languageProfile.codeqlLanguage);

  const sarifPath = join(repoRoot, "codeql-results.sarif");
  runAnalysis(
    codeqlPath,
    dbDir,
    sarifPath,
    buildAnalysisQueries(languageProfile.querySuite, customQueries, customQueriesMode),
  );

  const scanResult = parseSarifResults(sarifPath);
  safeUnlink(sarifPath);

  writeMarkdownReport(repoRoot, dbDir, scanResult, languageProfile.label);
  printSummary(repoRoot, scanResult.total, languageProfile.label);

  return scanResult;
}

// ---------------------------------------------------------------------------
// Scan steps
// ---------------------------------------------------------------------------

/**
 * Downloads the required CodeQL query pack if not already cached.
 * Uses the `codeql pack download` command.
 *
 * @param {string} codeqlPath - Absolute path to the `codeql` binary.
 * @param {string} queryPack - CodeQL query pack to download.
 */
function downloadQueryPack(codeqlPath, queryPack) {
  console.log(chalk.blue("⬇  Downloading CodeQL query pack…"));

  try {
    execFileSync(codeqlPath, ["pack", "download", queryPack], {
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
 * @param {string} codeqlLanguage - CodeQL language identifier.
 */
function createDatabase(codeqlPath, dbDir, sourceRoot, codeqlLanguage) {
  console.log(chalk.blue("🗄  Creating CodeQL database…"));

  execFileSync(
    codeqlPath,
    [
      "database",
      "create",
      dbDir,
      `--language=${codeqlLanguage}`,
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
 * @param {string} querySuite - CodeQL query suite to run.
 * @param {string[]} querySpecs - CodeQL query suite(s) or custom query file paths to run.
 */
function runAnalysis(codeqlPath, dbDir, sarifPath, querySpecs) {
  console.log(chalk.blue("🔍  Running security analysis…"));

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
        ...querySpecs,
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

function buildAnalysisQueries(defaultQuerySuite, customQueries, customQueriesMode) {
  if (customQueries.length === 0) {
    return [defaultQuerySuite];
  }

  if (customQueriesMode === "replace") {
    return customQueries;
  }

  return [defaultQuerySuite, ...customQueries];
}

function normalizeCustomQueries(repoRoot, queries) {
  const packRoots = toQueryList(queries)
    .map((query) => resolveCustomQueryPackRoot(repoRoot, query))
    .filter(Boolean);

  return [...new Set(packRoots)];
}

function normalizeCustomQueriesMode(mode) {
  const normalized = String(mode ?? "append").trim().toLowerCase();

  if (!normalized) {
    return "append";
  }

  if (normalized === "append" || normalized === "replace") {
    return normalized;
  }

  throw new Error(`Unsupported custom queries mode: ${mode}. Choose one of: append, replace.`);
}

function resolveCustomQueryPackRoot(repoRoot, queryPath) {
  const cleanedPath = String(queryPath ?? "").trim();

  if (!cleanedPath) {
    return null;
  }

  const resolvedPath = isAbsolute(cleanedPath) ? cleanedPath : resolve(repoRoot, cleanedPath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Custom query path not found: ${cleanedPath}`);
  }

  const initialDirectory = statSync(resolvedPath).isDirectory() ? resolvedPath : dirname(resolvedPath);
  const packRoot = findPackRoot(initialDirectory);

  if (!packRoot) {
    throw new Error(`Unable to locate a qlpack.yml for custom query path: ${cleanedPath}`);
  }

  return packRoot;
}

function findPackRoot(startDirectory) {
  let currentDirectory = startDirectory;

  while (true) {
    const qlpackPath = join(currentDirectory, "qlpack.yml");
    if (existsSync(qlpackPath) && statSync(qlpackPath).isFile()) {
      return currentDirectory;
    }

    const parentDirectory = dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      return null;
    }

    currentDirectory = parentDirectory;
  }
}

function toQueryList(queries) {
  if (Array.isArray(queries)) {
    return queries.flatMap((query) => String(query ?? "").split(","));
  }

  if (typeof queries === "string") {
    return queries.split(",");
  }

  return [];
}

// ---------------------------------------------------------------------------
// Result parsing
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ScanFinding
 * @property {string} id - The rule ID.
 * @property {string} description - Human-readable description.
 * @property {string} severity - Issue severity level.
 * @property {{ file: string | null, affectedLines: { start: number | null, end: number | null } }} location
 * @property {string} mitigation - Suggested mitigation for the finding.
 */

/**
 * @typedef {Object} ScanResult
 * @property {number}      total   - Total number of issues found.
 * @property {ScanFinding[]} details - Per-issue detail objects.
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
    id: result.ruleId ?? "unknown-rule",
    description: result.message?.text ?? "",
    severity: result.level ?? "warning",
    location: {
      file: result.locations?.[0]?.physicalLocation?.artifactLocation?.uri ?? null,
      affectedLines: {
        start: result.locations?.[0]?.physicalLocation?.region?.startLine ?? null,
        end:
          result.locations?.[0]?.physicalLocation?.region?.endLine ??
          result.locations?.[0]?.physicalLocation?.region?.startLine ??
          null,
      },
    },
    mitigation: buildMitigationSuggestion(result.level),
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
 * @param {string} languageLabel - Human-readable language label.
 */
function writeMarkdownReport(repoRoot, dbDir, scanResult, languageLabel) {
  const mdPath = join(repoRoot, "codeql-results.md");
  const lines = [
    "# CodeQL Security Scan Results\n",
    "## Summary\n",
    `- **Scan Timestamp:** ${new Date().toISOString()}`,
    `- **Total Issues Found:** ${scanResult.total}\n`,
  ];

  if (scanResult.total > 0) {
    lines.push("## Security Issues Found\n");

    const byFile = groupBy(
      scanResult.details,
      (issue) => issue.location.file ?? "Unknown Location",
    );

    for (const [file, issues] of Object.entries(byFile)) {
      lines.push(`### ${file}\n`);
      issues.forEach((issue, idx) => {
        lines.push(`${idx + 1}. **${issue.id}**`);
        if (issue.description) {
          lines.push(`   - Description: ${issue.description}`);
        }
        if (issue.severity) {
          lines.push(`   - Severity: ${issue.severity}`);
        }
        if (issue.location.affectedLines.start) {
          const { start, end } = issue.location.affectedLines;
          lines.push(`   - Affected lines: ${start}${end && end !== start ? `-${end}` : ""}`);
        }
        if (issue.mitigation) {
          lines.push(`   - Mitigation: ${issue.mitigation}`);
        }
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
    `- **Analysis Type:** ${languageLabel} Security Scan`,
  );

  writeFileSync(mdPath, lines.join("\n"), "utf8");
}

function buildMitigationSuggestion(severity) {
  if (severity === "error") {
    return "Review the vulnerable code path and apply the recommended CodeQL fix before release.";
  }

  if (severity === "warning") {
    return "Inspect the affected line and prefer a safer API or additional validation.";
  }

  return "Validate the surrounding logic and apply the appropriate CodeQL guidance.";
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
 * @param {string} languageLabel - Human-readable language label.
 */
function printSummary(repoRoot, total, languageLabel) {
  const reportPath = join(repoRoot, "codeql-results.md");
  if (total === 0) {
    console.log(
      chalk.green(`✔  No vulnerabilities detected by CodeQL for ${languageLabel}.`),
    );
  } else {
    console.log(
      chalk.yellow(
        `\n⚠  ${total} vulnerability(ies) found by CodeQL for ${languageLabel}.`,
      ),
    );
  }
  console.log(chalk.blue(`📄  Detailed report saved to ${reportPath}`));
}
