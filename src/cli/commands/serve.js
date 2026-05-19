import chalk from "chalk";

import { createApiServer } from "../../server/api-server.js";

/**
 * Starts the HTTP API server for scan integration.
 * @param {object} argv - Command-line arguments.
 */
export async function serveHandler(argv) {
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
}

export const serveCommand = {
  command: "serve",
  description: "Start the versioned HTTP API for scan integration",
  handler: serveHandler,
};
