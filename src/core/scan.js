import { execFileSync } from "child_process";
import { dirname, join } from "path";
import { homedir } from "os";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  mkdtempSync,
  renameSync,
  rmSync,
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
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;

  if (!languageProfile) {
    throw new Error(
      `Unsupported language: ${options.language}. Choose one of: javascript, python, java, csharp, go.`,
    );
  }

  onProgress?.({ stage: "preparing", message: "Preparing scan environment..." });
  ensureGitignoreEntry(repoRoot);

  const cacheDir = join(repoRoot, ".qlscan-cache");
  const dbDir = join(cacheDir, "db");
  mkdirSync(cacheDir, { recursive: true });

  onProgress?.({ stage: "downloading", message: "Downloading query pack..." });
  downloadQueryPack(codeqlPath, languageProfile.queryPack);

  onProgress?.({ stage: "database", message: "Creating CodeQL database..." });
  createDatabase(codeqlPath, dbDir, repoRoot, languageProfile.codeqlLanguage);

  onProgress?.({ stage: "analyzing", message: "Running security analysis..." });
  const sarifPath = join(repoRoot, "codeql-results.sarif");
  runAnalysis(codeqlPath, dbDir, sarifPath, languageProfile.querySuite);

  onProgress?.({ stage: "parsing", message: "Parsing results..." });
  const scanResult = parseSarifResults(sarifPath);
  safeUnlink(sarifPath);

  onProgress?.({ stage: "reporting", message: "Generating report..." });
  writeMarkdownReport(repoRoot, dbDir, scanResult, languageProfile.label);
  printSummary(repoRoot, scanResult.total, languageProfile.label);

  onProgress?.({ stage: "completed", message: "Scan completed" });
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
 */
function runAnalysis(codeqlPath, dbDir, sarifPath, querySuite) {
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
        querySuite,
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
 * @typedef {Object} ScanFinding
 * @property {string} id - The rule ID.
 * @property {string} description - Short human-readable description.
 * @property {string} extendedDescription - Detailed description (GitHub Actions style).
 * @property {string} severity - Issue severity level.
 * @property {{ file: string | null, affectedLines: { start: number | null, end: number | null } }} location
 * @property {string} mitigation - Suggested mitigation for the finding.
 * @property {string} rule - Human-readable rule name.
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
  const rules = raw?.runs?.[0]?.tool?.driver?.rules ?? [];
  const ruleMap = new Map(rules.map((rule) => [rule.id, rule]));

  const details = results.map((result) => {
    const rule = ruleMap.get(result.ruleId);
    const extendedMessage = rule?.fullDescription?.text || rule?.help?.text || "";
    const ruleName = rule?.name || result.ruleId || "Unknown Rule";

    return {
      id: result.ruleId ?? "unknown-rule",
      rule: ruleName,
      description: result.message?.text ?? "",
      extendedDescription: extendedMessage,
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
    };
  });

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
        lines.push(`${idx + 1}. **${issue.rule}** (\`${issue.id}\`)\n`);
        if (issue.description) {
          lines.push(`   **Summary:** ${issue.description}\n`);
        }
        if (issue.severity) {
          const severityBadge = issue.severity === "error" ? "🔴" : issue.severity === "warning" ? "🟡" : "🔵";
          lines.push(`   **Severity:** ${severityBadge} ${issue.severity.toUpperCase()}\n`);
        }
        if (issue.location.affectedLines.start) {
          const { start, end } = issue.location.affectedLines;
          lines.push(`   **Location:** Line${end && end !== start ? `s` : ""} ${start}${end && end !== start ? `-${end}` : ""}\n`);
        }
        if (issue.extendedDescription) {
          lines.push(`   **Details:**\n`);
          lines.push(`   > ${issue.extendedDescription.split("\n").join("\n   > ")}\n`);
        }
        if (issue.mitigation) {
          lines.push(`   **Remediation:** ${issue.mitigation}\n`);
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
  let currentContent = "";

  try {
    currentContent = readFileSync(gitignorePath, "utf8");
  } catch (error) {
    if (!error || error.code !== "ENOENT") {
      throw error;
    }
  }

  if (currentContent.split(/\r?\n/).some((line) => line.trim() === entry)) {
    return;
  }

  const normalizedContent = currentContent.length > 0 && !currentContent.endsWith("\n")
    ? `${currentContent}\n`
    : currentContent;
  const updatedContent = `${normalizedContent}${entry}\n`;
  const tempDir = mkdtempSync(join(dirname(gitignorePath), ".gitignore-"));
  const tempPath = join(tempDir, ".gitignore");

  try {
    writeFileSync(tempPath, updatedContent, "utf8");
    renameSync(tempPath, gitignorePath);
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup.
    }
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
