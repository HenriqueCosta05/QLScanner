import { existsSync, writeFileSync, chmodSync } from "fs";
import { join } from "path";
import chalk from "chalk";

/**
 * Installs the pre-commit Git hook in the current repository.
 * @param {object} argv - Command-line arguments.
 */
export async function initHookHandler(argv) {
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
}

export const initHookCommand = {
  command: "init-hook",
  description: "Install the pre-commit Git hook",
  handler: initHookHandler,
};
