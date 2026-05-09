import test from "node:test";
import assert from "node:assert/strict";

import { createInMemoryScanService } from "../lib/scan-service.js";

async function waitForStatus(getScan, id, expected) {
  for (let i = 0; i < 40; i += 1) {
    const scan = getScan(id);
    if (scan?.status === expected) return scan;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for status ${expected}`);
}

test("in-memory scan service runs scan and stores report", async () => {
  const scanService = createInMemoryScanService({
    executeScan: async ({ repoRoot }) => ({
      total: 2,
      details: [],
      reportPath: `${repoRoot}/codeql-results.md`,
      scannedDirectory: repoRoot,
    }),
  });

  const created = scanService.createScan({ repoRoot: "/tmp/project" });
  assert.equal(created.status, "queued");

  const completed = await waitForStatus(scanService.getScan, created.id, "completed");
  assert.equal(completed.issueCount, 2);

  const report = scanService.getScanReport(created.id);
  assert.equal(report.pending, false);
  assert.equal(report.report.total, 2);
});

test("in-memory scan service marks failed scans", async () => {
  const scanService = createInMemoryScanService({
    executeScan: async () => {
      throw new Error("scan failed");
    },
  });

  const created = scanService.createScan({ repoRoot: "/tmp/project" });
  const failed = await waitForStatus(scanService.getScan, created.id, "failed");
  assert.equal(failed.error, "scan failed");

  const report = scanService.getScanReport(created.id);
  assert.equal(report.pending, true);
  assert.equal(report.status, "failed");
});
