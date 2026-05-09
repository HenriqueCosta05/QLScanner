import test from "node:test";
import assert from "node:assert/strict";

import { createInMemoryScanService } from "../lib/scan-service.js";
import { waitForStatus } from "./test-helpers.js";

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
