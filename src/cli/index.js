import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import chalk from "chalk";

import { initHookCommand } from "./commands/init-hook.js";
import { hookCommand } from "./commands/hook.js";
import { scanCommand } from "./commands/scan.js";
import { serveCommand } from "./commands/serve.js";

/**
 * Creates and returns the yargs CLI instance with all commands registered.
 * Can be used from bin/qlscan.js or imported for testing/programmatic use.
 *
 * @param {string[]} args - Command-line arguments (defaults to process.argv)
 * @returns {Promise<void>}
 */
export async function createCLI(args = hideBin(process.argv)) {
  let cli = yargs(args);

  // Register all commands
  [initHookCommand, hookCommand, scanCommand, serveCommand].forEach((cmd) => {
    cli = cli.command(
      cmd.command,
      cmd.description,
      () => {},
      cmd.handler,
    );
  });

  // Global options
  return cli
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
    .option("queries", {
      type: "string",
      array: true,
      description: "Custom CodeQL query file paths (.ql or .qls) to run",
    })
    .option("queries-mode", {
      type: "string",
      choices: ["append", "replace"],
      default: "append",
      description: "Whether custom queries complement or replace the default suite",
    })
    .demandCommand(1, chalk.red("Please specify a command. Use --help for usage."))
    .strict()
    .help()
    .parse();
}

/**
 * Runs the CLI (for use in bin/qlscan.js and direct imports).
 */
export async function run() {
  await createCLI();
}
