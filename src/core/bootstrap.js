import {
  existsSync,
  mkdirSync,
  chmodSync,
  writeFileSync,
  readFileSync,
  createWriteStream,
  readdirSync,
  statSync,
  unlinkSync,
} from "fs";
import { join } from "path";
import { tmpdir, homedir } from "os";
import fetch from "node-fetch";
import { pipeline } from "stream/promises";
import cliProgress from "cli-progress";
import chalk from "chalk";
import { execFileSync } from "child_process";
import { Transform } from "stream";
import which from "which";

/** Absolute path to the directory where CodeQL is installed. */
const CODEQL_INSTALL_DIR = join(homedir(), ".qlscan", "codeql");

/** Resolved path to the CodeQL executable for the current platform. */
const CODEQL_CLI_PATH = join(
  CODEQL_INSTALL_DIR,
  "codeql",
  process.platform === "win32" ? "codeql.exe" : "codeql",
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ensures the CodeQL CLI is installed and executable.
 * Downloads and extracts it from GitHub Releases if it is missing or corrupt.
 *
 * @param {object} [options]
 * @param {string} [options.installMode] - `managed`, `installed`, or `update`.
 * @param {(question: string) => Promise<string>} [options.prompt] - Prompt helper for interactive choices.
 * @returns {Promise<string>} The absolute path to the `codeql` binary.
 */
export async function ensureCodeQL(options = {}) {
  const installMode = options.installMode ?? "managed";
  const prompt = typeof options.prompt === "function" ? options.prompt : null;
  const installedCodeQL = findSystemCodeQL();

  if (installMode === "installed") {
    if (installedCodeQL) {
      return installedCodeQL;
    }

    throw new Error(
      "Requested the installed CodeQL binary, but none was found in PATH.",
    );
  }

  if (installMode !== "update" && isCodeQLHealthy()) {
    return CODEQL_CLI_PATH;
  }

  if (installedCodeQL && installMode !== "update") {
    if (prompt) {
      const answer = await prompt(
        `CodeQL is already installed at ${installedCodeQL}. Use it instead of downloading a managed copy? [Y/n]: `,
      );

      if (/^n(o)?$/i.test(answer.trim())) {
        return await reinstallManagedCodeQL();
      }
    }

    return installedCodeQL;
  }

  if (installMode === "update" && prompt && isCodeQLHealthy()) {
    const answer = await prompt(
      "A managed CodeQL installation already exists. Update it to the latest version? [Y/n]: ",
    );

    if (!/^y(es)?$/i.test(answer.trim())) {
      return CODEQL_CLI_PATH;
    }
  }

  if (prompt && !installedCodeQL && !isCodeQLHealthy()) {
    const answer = await prompt(
      "No CodeQL installation was found. Install the QLScanner-managed version now? [Y/n]: ",
    );

    if (!/^y(es)?$/i.test(answer.trim())) {
      throw new Error("CodeQL installation was cancelled by the user.");
    }
  }

  return await reinstallManagedCodeQL();
}

// ---------------------------------------------------------------------------
// Installation helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the CodeQL binary exists and responds to `--version`.
 */
function isCodeQLHealthy() {
  if (!existsSync(CODEQL_CLI_PATH)) return false;

  try {
    execFileSync(CODEQL_CLI_PATH, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    console.warn(
      chalk.yellow("⚠  Existing CodeQL installation is corrupt. Reinstalling…"),
    );
    return false;
  }
}

function findSystemCodeQL() {
  try {
    const codeqlPath = which.sync("codeql", { nothrow: true });

    if (!codeqlPath) {
      return null;
    }

    execFileSync(codeqlPath, ["--version"], { stdio: "ignore" });
    return codeqlPath;
  } catch {
    return null;
  }
}

async function reinstallManagedCodeQL() {
  const version = await resolveLatestCodeQLVersion(true);
  await downloadAndExtractCodeQL(version);

  writeFileSync(join(CODEQL_INSTALL_DIR, "version.txt"), version, "utf8");
  console.log(chalk.green("✔  CodeQL installed successfully."));

  return CODEQL_CLI_PATH;
}

/**
 * Downloads the CodeQL bundle for the current platform and extracts it.
 *
 * @param {string} version - The CodeQL bundle version to download.
 */
async function downloadAndExtractCodeQL(version) {
  const safeVersion = normalizeCodeQLVersion(version);

  if (!safeVersion) {
    throw new Error(`Invalid CodeQL version: ${version}`);
  }

  const platform = process.platform === "win32" ? "win64" : "linux64";
  const bundleName = `codeql-bundle-${platform}.tar.gz`;
  const url = `https://github.com/github/codeql-action/releases/download/codeql-bundle-v${safeVersion}/${bundleName}`;
  const tmpFile = join(tmpdir(), bundleName);

  console.log(chalk.blue(`⬇  Downloading CodeQL CLI v${safeVersion}…`));
  mkdirSync(CODEQL_INSTALL_DIR, { recursive: true });

  try {
    await downloadFile(url, tmpFile);
  } catch (err) {
    safeUnlink(tmpFile);
    throw err;
  }

  console.log(chalk.blue("📦  Extracting CodeQL…"));
  try {
    await extractTarGz(tmpFile, CODEQL_INSTALL_DIR);
  } catch (err) {
    console.error(chalk.red("✖  Extraction failed:"), err.message);
    throw err;
  } finally {
    safeUnlink(tmpFile);
  }

  fixExecPermissionsRecursively(CODEQL_INSTALL_DIR);
}

/**
 * Downloads a remote URL to a local file path, showing a progress bar
 * when the content-length header is available.
 *
 * @param {string} url      - Remote URL.
 * @param {string} destPath - Local file path to write to.
 */
async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to download CodeQL: ${res.status} ${res.statusText}`,
    );
  }

  const total = Number(res.headers.get("content-length") ?? 0);

  if (total > 0) {
    const bar = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic,
    );
    bar.start(total, 0);
    try {
      await pipeline(
        res.body,
        new ProgressStream(bar),
        createWriteStream(destPath),
      );
    } finally {
      bar.stop();
    }
  } else {
    await pipeline(res.body, createWriteStream(destPath));
  }
}

/**
 * Extracts a `.tar.gz` archive to the given destination directory.
 *
 * @param {string} src  - Path to the `.tar.gz` file.
 * @param {string} dest - Directory to extract into.
 */
async function extractTarGz(src, dest) {
  const { createGunzip } = await import("zlib");
  const tar = await import("tar-stream");
  const { createReadStream, createWriteStream: cws } = await import("fs");

  const extract = tar.extract();

  extract.on("entry", (header, stream, next) => {
    const outPath = join(dest, header.name);

    if (header.type === "directory") {
      mkdirSync(outPath, { recursive: true });
      stream.resume();
      next();
      return;
    }

    // Ensure parent directory exists before writing
    const parentDir = join(dest, header.name.split("/").slice(0, -1).join("/"));
    mkdirSync(parentDir, { recursive: true });

    const writer = cws(outPath);
    writer.on("error", next);
    writer.on("finish", next);
    stream.pipe(writer);
  });

  await pipeline(createReadStream(src), createGunzip(), extract);
}

/**
 * Recursively sets executable permissions (0o755) on all files in a directory.
 * Failures on individual files are silently ignored (e.g. read-only mounts).
 *
 * @param {string} dir - Root directory to process.
 */
function fixExecPermissionsRecursively(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      fixExecPermissionsRecursively(fullPath);
    } else if (stats.isFile()) {
      try {
        chmodSync(fullPath, 0o755);
      } catch {
        // Intentionally ignored — non-critical on most platforms.
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Version resolution
// ---------------------------------------------------------------------------

/**
 * Returns the latest CodeQL bundle version string.
 * Uses a locally cached `version.txt` if the CLI is already installed.
 *
 * @returns {Promise<string>} e.g. `"2.19.3"`
 */
async function resolveLatestCodeQLVersion(forceRefresh = false) {
  const cacheFile = join(CODEQL_INSTALL_DIR, "version.txt");

  if (!forceRefresh && existsSync(cacheFile)) {
    const cachedVersion = normalizeCodeQLVersion(readFileSync(cacheFile, "utf8").trim());

    if (cachedVersion) {
      return cachedVersion;
    }

    console.warn(
      chalk.yellow("⚠  Ignoring invalid cached CodeQL version and refreshing from GitHub…"),
    );
  }

  console.log(chalk.gray("🔍  Fetching latest CodeQL version from GitHub…"));

  const res = await fetch(
    "https://api.github.com/repos/github/codeql-action/releases/latest",
    { headers: { "User-Agent": "qlscan-cli" } },
  );

  if (!res.ok) {
    throw new Error(
      `Failed to fetch CodeQL version: ${res.status} ${res.statusText}`,
    );
  }

  const json = await res.json();
  const version = normalizeCodeQLVersion(
    (json.tag_name ?? "").replace(/^codeql-bundle-v/, ""),
  );

  if (!version) {
    throw new Error("Unable to parse CodeQL version from GitHub API response.");
  }

  return version;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

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
 * Normalizes and validates a CodeQL bundle version string.
 *
 * @param {string} version
 * @returns {string | null}
 */
function normalizeCodeQLVersion(version) {
  const trimmedVersion = version.trim();

  return /^\d+\.\d+\.\d+$/.test(trimmedVersion) ? trimmedVersion : null;
}

/**
 * A passthrough Transform stream that updates a cli-progress bar
 * as chunks flow through it.
 */
class ProgressStream extends Transform {
  /** @param {import('cli-progress').SingleBar} bar */
  constructor(bar) {
    super();
    this._bar = bar;
    this._bytesReceived = 0;
  }

  _transform(chunk, _encoding, callback) {
    this._bytesReceived += chunk.length;
    this._bar.update(this._bytesReceived);
    this.push(chunk);
    callback();
  }
}
