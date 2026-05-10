#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { existsSync, writeFileSync, chmodSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import chalk from "chalk";

import { ensureCodeQL } from "../lib/bootstrap.js";
import { runScan } from "../lib/scan.js";
import { createApiServer } from "../lib/api-server.js";
import { buildLanguageMenu, getLanguageProfile } from "../lib/scan-profiles.js";

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

async function promptLanguage(defaultLanguageId) {
  const menu = buildLanguageMenu();

  console.log(chalk.cyan("Choose the primary programming language:"));
  for (const item of menu) {
    console.log(`  ${item.index}. ${item.label}`);
  }

  while (true) {
    const answer = await prompt(
      `Select language [${defaultLanguageId ?? menu[0].id}]: `,
    );

    if (!answer) {
      return defaultLanguageId ?? menu[0].id;
    }

    const selectedByIndex = menu.find((item) => String(item.index) === answer);
    if (selectedByIndex) {
      return selectedByIndex.id;
    }

    const selectedByAlias = getLanguageProfile(answer);
    if (selectedByAlias) {
      return selectedByAlias.id;
    }

    console.log(chalk.yellow("Invalid language selection. Try again."));
  }
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

        const language = await promptLanguage("javascript");
        const codeqlPath = await ensureCodeQL({ prompt });
        const issueCount = await runScan(codeqlPath, process.cwd(), {
          language,
        });

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
    async () => {
      try {
        const language = await promptLanguage("javascript");
        const codeqlPath = await ensureCodeQL({ prompt });
        await runScan(codeqlPath, process.cwd(), { language });
      } catch (err) {
        console.error(chalk.red("✖  Scan failed:"), err.message);
        process.exit(1);
      }
    },
  )


  // ── serve ───────────────────────────────────────────────────────────────
  .command(
    "serve",
    "Start the versioned HTTP API for scan integration",
    () => {},
    async (argv) => {
      try {
        const api = createApiServer({
          host: argv.host,
          port: argv.port,
          defaultRepoRoot: argv["repo-root"],
          defaultLanguage: argv.language,
        });

        await api.listen();
      } catch (err) {
        console.error(chalk.red("✖  API server failed to start:"), err.message);
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
  .option("host", {
    type: "string",
    description: "Host to bind the HTTP API server to",
    default: "127.0.0.1",
  })
  .option("port", {
    type: "number",
    description: "Port for the HTTP API server",
    default: 3000,
  })
  .option("repo-root", {
    type: "string",
    description: "Default repository root used by the API server",
    default: process.cwd(),
  })
  .option("language", {
    type: "string",
    description: "Primary language to use when the caller does not provide one",
  })
  .demandCommand(1, chalk.red("Please specify a command. Use --help for usage."))
  .strict()
  .help()
  .parse();
