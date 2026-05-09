import { randomUUID } from "crypto";

/**
 * Creates a transport-agnostic in-memory scan service.
 *
 * @param {{
 *   executeScan: (input: { id: string, repoRoot: string }) => Promise<any>,
 *   createId?: () => string,
 *   now?: () => string,
 *   maxConcurrent?: number
 * }} options
 */
export function createInMemoryScanService(options) {
  const {
    executeScan,
    createId = randomUUID,
    now = () => new Date().toISOString(),
    maxConcurrent = 1,
  } = options;
  const concurrency = Number.isInteger(maxConcurrent) && maxConcurrent > 0 ? maxConcurrent : 1;
  const scans = new Map();
  const pendingScans = [];
  let runningScans = 0;

  function toScanSummary(scan) {
    return {
      id: scan.id,
      repoRoot: scan.repoRoot,
      status: scan.status,
      createdAt: scan.createdAt,
      startedAt: scan.startedAt,
      completedAt: scan.completedAt,
      issueCount: scan.issueCount,
      error: scan.error,
    };
  }

  async function runScan(scan) {
    scan.status = "in_progress";
    scan.startedAt = now();

    try {
      scan.report = await executeScan({ id: scan.id, repoRoot: scan.repoRoot });
      scan.issueCount = scan.report?.total ?? 0;
      scan.status = "completed";
    } catch (err) {
      scan.status = "failed";
      scan.error = err instanceof Error ? err.message : String(err);
    } finally {
      scan.completedAt = now();
    }
  }

  function pumpQueue() {
    while (runningScans < concurrency && pendingScans.length > 0) {
      const nextScan = pendingScans.shift();
      runningScans += 1;
      runScan(nextScan).finally(() => {
        runningScans -= 1;
        pumpQueue();
      });
    }
  }

  return {
    createScan({ repoRoot }) {
      const scan = {
        id: createId(),
        repoRoot,
        status: "queued",
        createdAt: now(),
        startedAt: null,
        completedAt: null,
        issueCount: null,
        error: null,
        report: null,
      };

      scans.set(scan.id, scan);
      pendingScans.push(scan);
      pumpQueue();
      return toScanSummary(scan);
    },

    listScans() {
      return Array.from(scans.values()).map(toScanSummary);
    },

    getScan(id) {
      const scan = scans.get(id);
      return scan ? toScanSummary(scan) : null;
    },

    getScanReport(id) {
      const scan = scans.get(id);
      if (!scan) return null;
      if (scan.status !== "completed") return { pending: true, status: scan.status };
      return { pending: false, report: scan.report };
    },
  };
}
