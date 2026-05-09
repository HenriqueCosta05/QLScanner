import { randomUUID } from "crypto";
import { resolve, join } from "path";
import { existsSync, statSync } from "fs";

import { ensureCodeQL } from "./bootstrap.js";
import { runScan } from "./scan.js";

/**
 * Creates an in-memory scan manager for asynchronous execution.
 *
 * The transport layer can use this manager from HTTP, gRPC, or any other
 * integration surface without coupling itself to the scan implementation.
 *
 * @param {object} [options]
 * @param {string} [options.defaultRepoRoot] - Fallback repository root.
 * @returns {{ startScan: Function, getScan: Function, listScans: Function }}
 */
export function createScanService(options = {}) {
  const defaultRepoRoot = resolve(options.defaultRepoRoot ?? process.cwd());
  const jobs = new Map();

  return {
    async startScan(request = {}) {
      const repoRoot = resolve(request.repositoryRoot ?? defaultRepoRoot);
      validateRepositoryRoot(repoRoot);

      const jobId = randomUUID();
      const job = {
        id: jobId,
        repositoryRoot: repoRoot,
        status: "queued",
        totalIssues: null,
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

    try {
      const codeqlPath = await ensureCodeQL();
      const issueCount = await runScan(codeqlPath, job.repositoryRoot);

      job.totalIssues = issueCount;
      job.status = "completed";
      job.finishedAt = new Date().toISOString();
    } catch (error) {
      job.status = "failed";
      job.error = error?.message ?? String(error);
      job.finishedAt = new Date().toISOString();
    }
  }
}

function snapshotJob(job) {
  return {
    id: job.id,
    repositoryRoot: job.repositoryRoot,
    status: job.status,
    totalIssues: job.totalIssues,
    reportPath: job.reportPath,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
  };
}

function validateRepositoryRoot(repoRoot) {
  if (!existsSync(repoRoot) || !statSync(repoRoot).isDirectory()) {
    throw new Error(`Repository root not found or not a directory: ${repoRoot}`);
  }
}