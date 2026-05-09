#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { existsSync, writeFileSync, chmodSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import chalk from "chalk";

import { ensureCodeQL } from "../lib/bootstrap.js";
import { runScan } from "../lib/scan.js";
import { resolveCodeQLLanguage, getSupportedCodeQLLanguageHelpText } from "../lib/codeql-languages.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Prompts the user for input on stdin and returns the trimmed response.
 * @param {string} question - The question to display.
 * @returns {Promise<string>}
 */
function prompt(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.once("data", (data) => resolve(data.toString().trim()));
  });
}

/**
 * Returns true if any of the provided newline-separated file paths
 * match a scannable extension.
 * @param {string} changedFiles - Output of `git diff --cached --name-only`.
 * @returns {boolean}
 */
function hasSupportedFiles(changedFiles) {
  return changedFiles
    .split("\n")
    .some((line) => /\.(js|ts|jsx|tsx|py|cs)$/.test(line.trim()));
}

// ---------------------------------------------------------------------------
// CLI definition
// ---------------------------------------------------------------------------

yargs(hideBin(process.argv))
  // ── init-hook ────────────────────────────────────────────────────────────
  .command(
    "init-hook",
    "Install the pre-commit Git hook",
    () => {},
    async () => {
      const hookDir = join(process.cwd(), ".git", "hooks");
      const hookFile = join(hookDir, "pre-commit");

      if (!existsSync(hookDir)) {
        console.error(
          chalk.red(
            "✖  Not a Git repository. Please run this command inside a Git project.",
          ),
        );
        process.exit(1);
      }

      const stub = `#!/usr/bin/env bash\nnpx qlscan hook\n`;
      writeFileSync(hookFile, stub);
      chmodSync(hookFile, 0o755);
      console.log(chalk.green("✔  Pre-commit hook installed successfully."));
    },
  )

  // ── hook (internal – called by the pre-commit script) ────────────────────
  .command(
    "hook",
    false, // hidden from help output; internal use only
    () => {},
    async () => {
      try {
        const changedFiles = execSync(
          "git diff --cached --name-only --diff-filter=ACM",
        ).toString();

        if (!hasSupportedFiles(changedFiles)) {
          process.exit(0);
        }

        const codeqlPath = await ensureCodeQL();
        const issueCount = await runScan(codeqlPath, process.cwd());

        if (issueCount > 0) {
          console.log(
            chalk.yellow(
              `\n⚠  ${issueCount} vulnerability(ies) found by CodeQL.`,
            ),
          );
          const answer = await prompt("Do you still want to commit? [y/N]: ");
          if (!/^y(es)?$/i.test(answer)) {
            process.exit(1);
          }
        }
      } catch (err) {
        console.error(chalk.red("✖  Hook failed:"), err.message);
        process.exit(1);
      }
    },
  )

  // ── scan ─────────────────────────────────────────────────────────────────
  .command(
    "scan",
    "Manually scan the current repository",
    () => {},
    async (argv) => {
      try {
        const codeqlPath = await ensureCodeQL();
        await runScan(codeqlPath, process.cwd(), {
          language: argv.language,
        });
      } catch (err) {
        console.error(chalk.red("✖  Scan failed:"), err.message);
        process.exit(1);
      }
    },
  )

  // ── global options ────────────────────────────────────────────────────────
  .option("verbose", {
    alias: "v",
    type: "boolean",
    description: "Show detailed output during execution",
  })
  .option("language", {
    alias: "l",
    type: "string",
    description: "Select the CodeQL language to scan",
  })
  .check((argv) => {
    if (argv.language && !resolveCodeQLLanguage(argv.language)) {
      throw new Error(
        `Unsupported CodeQL language: ${argv.language}. Supported languages are: ${getSupportedCodeQLLanguageHelpText()}.`,
      );
    }
    return true;
  })
  .demandCommand(
    1,
    chalk.red("Please specify a command. Use --help for usage."),
  )
  .strict()
  .help()
  .parse();
