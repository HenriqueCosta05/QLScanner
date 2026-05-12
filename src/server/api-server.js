import { createServer } from "http";
import { URL } from "url";
import chalk from "chalk";

import { createScanService } from "../core/scan-service.js";
import { listCodeQLModes, listSupportedLanguageProfiles } from "../core/scan-profiles.js";

/**
 * Creates an HTTP API server for scan orchestration.
 *
 * Routes are versioned under `/api/v1`.
 *
 * @param {object} [options]
 * @param {string} [options.host] - Host to bind.
 * @param {number} [options.port] - Port to bind.
 * @param {string} [options.defaultRepoRoot] - Fallback repository root.
 * @param {string} [options.defaultLanguage] - Default primary language.
 * @returns {{ server: import('http').Server, listen: Function, close: Function }}
 */
export function createApiServer(options = {}) {
  const host = options.host ?? "127.0.0.1";
  const port = Number(options.port ?? 3000);
  const service = createScanService({
    defaultRepoRoot: options.defaultRepoRoot,
    defaultLanguage: options.defaultLanguage,
    requireLanguageSelection: true,
  });

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
        return sendJson(response, 200, service.listScans());
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/v1/options") {
        return sendJson(response, 200, {
          languages: listSupportedLanguageProfiles(),
          codeqlModes: listCodeQLModes(),
        });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/v1/scans") {
        const body = await readJsonBody(request);
        const job = await service.startScan({
          repositoryRoot: body.repositoryRoot,
          language: body.language,
          codeqlMode: body.codeqlMode,
        });

        return sendJson(response, 202, job);
      }

      const scanMatch = requestUrl.pathname.match(/^\/api\/v1\/scans\/([^/]+)(?:\/report)?$/);
      if (scanMatch) {
        const scanId = scanMatch[1];
        const job = service.getScan(scanId);

        if (!job) {
          return sendErrorJson(response, 404, "Scan not found", {
            scanId,
          });
        }

        if (requestUrl.pathname.endsWith("/report")) {
          if (!job.report) {
            return sendErrorJson(response, 409, "Scan report is not available yet", {
              scanId,
              status: job.status,
            });
          }

          return sendJson(response, 200, job.report.findings);
        }

        return sendJson(response, 200, job);
      }

      return sendErrorJson(response, 404, "Route not found", {
        path: requestUrl.pathname,
      });
    } catch (error) {
      return sendErrorJson(response, 400, error?.message ?? String(error));
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
  response.end(`${JSON.stringify({ success: true, data: normalizeData(payload) }, null, 2)}\n`);
}

function sendErrorJson(response, statusCode, message, context = {}) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(
    `${JSON.stringify(
      {
        success: false,
        data: [
          {
            message,
            ...context,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
}

function normalizeData(payload) {
  return Array.isArray(payload) ? payload : [payload];
}
