import chalk from "chalk";

import { ensureCodeQL } from "../../core/bootstrap.js";
import { runScan } from "../../core/scan.js";
import { prompt, promptLanguage } from "../utils/prompt.js";

/**
 * Manually scans the current repository for vulnerabilities.
 * @param {object} argv - Command-line arguments.
 */
export async function scanHandler(argv) {
  try {
    const language = await promptLanguage("javascript");
    const codeqlPath = await ensureCodeQL({ prompt });
    await runScan(codeqlPath, process.cwd(), { language });
  } catch (err) {
    console.error(chalk.red("✖  Scan failed:"), err.message);
    process.exit(1);
  }
}

export const scanCommand = {
  command: "scan",
  description: "Manually scan the current repository",
  handler: scanHandler,
};
