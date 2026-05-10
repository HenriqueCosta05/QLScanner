// Central registry for all CLI commands.
// Each command exports { command, description, handler }.

export { initHookCommand } from "./init-hook.js";
export { hookCommand } from "./hook.js";
export { scanCommand } from "./scan.js";
export { serveCommand } from "./serve.js";

/**
 * Returns all available CLI commands.
 * @returns {Array<{command: string, description: string, handler: Function}>}
 */
export function getAllCommands() {
  return [
    { command: "init-hook", description: "Install the pre-commit Git hook" },
    { command: "hook", description: false },
    { command: "scan", description: "Manually scan the current repository" },
    { command: "serve", description: "Start the versioned HTTP API for scan integration" },
  ];
}
