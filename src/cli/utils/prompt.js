import chalk from "chalk";
import { buildLanguageMenu, getLanguageProfile } from "../../core/scan-profiles.js";

/**
 * Prompts the user for input on stdin and returns the trimmed response.
 * @param {string} question - The question to display.
 * @returns {Promise<string>}
 */
export function prompt(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.once("data", (data) => resolve(data.toString().trim()));
  });
}

/**
 * Prompts the user to select a primary programming language.
 * @param {string} [defaultLanguageId] - Default language ID if user just presses Enter.
 * @returns {Promise<string>} The selected language ID.
 */
export async function promptLanguage(defaultLanguageId) {
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
export function hasSupportedFiles(changedFiles) {
  return changedFiles
    .split("\n")
    .some((line) => /\.(js|ts|jsx|tsx|py|cs)$/.test(line.trim()));
}
