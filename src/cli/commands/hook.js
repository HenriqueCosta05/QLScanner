import { execSync } from "child_process";
import chalk from "chalk";

import { ensureCodeQL } from "../../core/bootstrap.js";
import { runScan } from "../../core/scan.js";
import { prompt, promptLanguage, hasSupportedFiles } from "../utils/prompt.js";

/**
 * Executes the pre-commit hook: checks staged files and runs scan if needed.
 * Internal use only (called by the pre-commit script).
 * @param {object} argv - Command-line arguments.
 */
export async function hookHandler(argv) {
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
}

export const hookCommand = {
  command: "hook",
  description: false, // hidden from help output; internal use only
  handler: hookHandler,
};
