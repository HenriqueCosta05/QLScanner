import { randomUUID } from "crypto";
import { resolve, join } from "path";
import { existsSync, statSync } from "fs";

import { ensureCodeQL } from "./bootstrap.js";
import { runScan } from "./scan.js";
import {
  getCodeQLMode,
  getLanguageProfile,
  listSupportedLanguageIds,
} from "./scan-profiles.js";

/**
 * Creates an in-memory scan manager for asynchronous execution.
 *
 * The transport layer can use this manager from HTTP, gRPC, or any other
 * integration surface without coupling itself to the scan implementation.
 *
 * @param {object} [options]
 * @param {string} [options.defaultRepoRoot] - Fallback repository root.
 * @param {string} [options.defaultLanguage] - Fallback primary language.
 * @param {boolean} [options.requireLanguageSelection] - Require explicit request language.
 * @returns {{ startScan: Function, getScan: Function, listScans: Function }}
 */
export function createScanService(options = {}) {
  const defaultRepoRoot = resolve(options.defaultRepoRoot ?? process.cwd());
  const defaultLanguage = getLanguageProfile(options.defaultLanguage ?? "javascript");
  const defaultLanguageId = defaultLanguage?.id ?? "javascript";
  const requireLanguageSelection = options.requireLanguageSelection ?? false;
  const jobs = new Map();

  return {
    async startScan(request = {}) {
      const repoRoot = resolve(request.repositoryRoot ?? defaultRepoRoot);
      const languageChoice = request.language ?? (requireLanguageSelection ? null : defaultLanguageId);
      const languageProfile = getLanguageProfile(languageChoice);
      const codeqlMode = getCodeQLMode(request.codeqlMode ?? "managed");

      if (!languageProfile) {
        throw new Error(
          `${requireLanguageSelection && !request.language ? "Language is required for API scan requests." : `Unsupported language: ${request.language}` } Choose one of: ${listSupportedLanguageIds().join(", ")}.`,
        );
      }

      if (!codeqlMode) {
        throw new Error(
          `Unsupported CodeQL mode: ${request.codeqlMode}. Choose one of: managed, installed, update.`,
        );
      }

      validateRepositoryRoot(repoRoot);

      const jobId = randomUUID();
      const job = {
        id: jobId,
        repositoryRoot: repoRoot,
        language: languageProfile.id,
        languageLabel: languageProfile.label,
        codeqlMode: codeqlMode.id,
        customQueries: normalizeCustomQueries(request.customQueries ?? request.queries),
        customQueriesMode: normalizeCustomQueriesMode(
          request.customQueriesMode ?? request.queriesMode,
        ),
        status: "queued",
        totalIssues: null,
        report: null,
        progress: { stage: "queued", message: "Waiting to start...", percentage: 0 },
        reportPath: join(repoRoot, "codeql-results.md"),
        createdAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null,
        error: null,
      };

      jobs.set(jobId, job);
      void runJob(job);

      return snapshotJob(job);
    },

    getScan(scanId) {
      const job = jobs.get(scanId);
      return job ? snapshotJob(job) : null;
    },

    listScans() {
      return [...jobs.values()].map(snapshotJob);
    },
  };

  async function runJob(job) {
    job.status = "running";
    job.startedAt = new Date().toISOString();
    job.progress = { stage: "queued", message: "Initializing scan...", percentage: 0 };

    try {
      job.progress = { stage: "bootstrap", message: "Ensuring CodeQL is ready...", percentage: 5 };
      const codeqlPath = await ensureCodeQL({
        installMode: job.codeqlMode,
      });

      const scanResult = await runScan(codeqlPath, job.repositoryRoot, {
        language: job.language,
        customQueries: job.customQueries,
        customQueriesMode: job.customQueriesMode,
        onProgress: (progress) => {
          const stageProgress = {
            preparing: 10,
            downloading: 20,
            database: 40,
            analyzing: 60,
            parsing: 80,
            reporting: 90,
            completed: 100,
          };
          job.progress = {
            stage: progress.stage,
            message: progress.message,
            percentage: stageProgress[progress.stage] ?? 50,
          };
        },
      });

      job.totalIssues = scanResult.total;
      job.report = {
        totalIssues: scanResult.total,
        findings: scanResult.details,
      };
      job.status = "completed";
      job.finishedAt = new Date().toISOString();
      job.progress = { stage: "completed", message: "Scan completed successfully", percentage: 100 };
    } catch (error) {
      job.status = "failed";
      job.error = error?.message ?? String(error);
      job.finishedAt = new Date().toISOString();
      job.progress = { stage: "failed", message: `Scan failed: ${error?.message ?? String(error)}`, percentage: 0 };
    }
  }
}

function snapshotJob(job) {
  return {
    id: job.id,
    repositoryRoot: job.repositoryRoot,
    status: job.status,
    totalIssues: job.totalIssues,
    progress: job.progress,
    report: job.report,
    reportPath: job.reportPath,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
    language: job.language,
    languageLabel: job.languageLabel,
    codeqlMode: job.codeqlMode,
    customQueries: job.customQueries,
    customQueriesMode: job.customQueriesMode,
  };
}

function validateRepositoryRoot(repoRoot) {
  if (!existsSync(repoRoot) || !statSync(repoRoot).isDirectory()) {
    throw new Error(`Repository root not found or not a directory: ${repoRoot}`);
  }
}

function normalizeCustomQueries(queries) {
  if (Array.isArray(queries)) {
    return queries.flatMap((query) => String(query ?? "").split(",")).filter(Boolean);
  }

  if (typeof queries === "string") {
    return queries.split(",").map((query) => query.trim()).filter(Boolean);
  }

  return [];
}

function normalizeCustomQueriesMode(mode) {
  const normalized = String(mode ?? "append").trim().toLowerCase();

  if (!normalized) {
    return "append";
  }

  if (normalized === "append" || normalized === "replace") {
    return normalized;
  }

  throw new Error(`Unsupported custom queries mode: ${mode}. Choose one of: append, replace.`);
}
