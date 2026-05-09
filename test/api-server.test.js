import test from "node:test";
import assert from "node:assert/strict";

import { createInMemoryScanService } from "../lib/scan-service.js";
import { startApiServer } from "../lib/api-server.js";

test("API exposes health and scan lifecycle endpoints", async () => {
  const scanService = createInMemoryScanService({
    executeScan: async ({ repoRoot }) => ({
      total: 1,
      details: [{ name: "rule", severity: "warning" }],
      scannedDirectory: repoRoot,
      reportPath: `${repoRoot}/codeql-results.md`,
    }),
  });

  const api = await startApiServer({
    host: "127.0.0.1",
    port: 0,
    scanService,
  });

  try {
    const health = await fetch(`${api.baseUrl}/health`);
    assert.equal(health.status, 200);

    const create = await fetch(`${api.baseUrl}/scans`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repoRoot: "/tmp/repo" }),
    });
    assert.equal(create.status, 202);
    const created = await create.json();
    assert.ok(created.scan.id);

    const list = await fetch(`${api.baseUrl}/scans`);
    assert.equal(list.status, 200);
    const listBody = await list.json();
    assert.equal(Array.isArray(listBody.scans), true);

    for (let i = 0; i < 40; i += 1) {
      const statusRes = await fetch(`${api.baseUrl}/scans/${created.scan.id}`);
      const statusBody = await statusRes.json();
      if (statusBody.scan.status === "completed") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const report = await fetch(`${api.baseUrl}/scans/${created.scan.id}/report`);
    assert.equal(report.status, 200);
    const reportBody = await report.json();
    assert.equal(reportBody.report.total, 1);
  } finally {
    await api.close();
  }
});
