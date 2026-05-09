import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { URL } from "url";
import chalk from "chalk";

import { createScanService } from "./scan-service.js";

/**
 * Creates an HTTP API server for scan orchestration.
 *
 * Routes are versioned under `/api/v1`.
 *
 * @param {object} [options]
 * @param {string} [options.host] - Host to bind.
 * @param {number} [options.port] - Port to bind.
 * @param {string} [options.defaultRepoRoot] - Fallback repository root.
 * @returns {{ server: import('http').Server, listen: Function, close: Function }}
 */
export function createApiServer(options = {}) {
  const host = options.host ?? "127.0.0.1";
  const port = Number(options.port ?? 3000);
  const service = createScanService({ defaultRepoRoot: options.defaultRepoRoot });

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);

    try {
      if (request.method === "GET" && requestUrl.pathname === "/api/v1/health") {
        return sendJson(response, 200, {
          status: "ok",
          apiVersion: "v1",
          service: "qlscanner-api",
        });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/v1/scans") {
        return sendJson(response, 200, {
          scans: service.listScans(),
        });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/v1/scans") {
        const body = await readJsonBody(request);
        const job = await service.startScan({
          repositoryRoot: body.repositoryRoot,
        });

        return sendJson(response, 202, job);
      }

      const scanMatch = requestUrl.pathname.match(/^\/api\/v1\/scans\/([^/]+)(?:\/report)?$/);
      if (scanMatch) {
        const scanId = scanMatch[1];
        const job = service.getScan(scanId);

        if (!job) {
          return sendJson(response, 404, {
            error: "Scan not found",
            scanId,
          });
        }

        if (requestUrl.pathname.endsWith("/report")) {
          if (!existsSync(job.reportPath)) {
            return sendJson(response, 409, {
              error: "Scan report is not available yet",
              scanId,
              status: job.status,
            });
          }

          return sendText(response, 200, readFileSync(job.reportPath, "utf8"), "text/markdown; charset=utf-8");
        }

        return sendJson(response, 200, job);
      }

      return sendJson(response, 404, {
        error: "Route not found",
        path: requestUrl.pathname,
      });
    } catch (error) {
      return sendJson(response, 400, {
        error: error?.message ?? String(error),
      });
    }
  });

  return {
    server,
    listen() {
      return new Promise((resolve) => {
        server.listen(port, host, () => {
          console.log(chalk.green(`✔  QLScanner API listening on http://${host}:${port}`));
          resolve({ host, port });
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendText(response, statusCode, text, contentType) {
  response.writeHead(statusCode, {
    "content-type": contentType,
  });
  response.end(text);
}