import http from "http";

const API_PREFIX = "/api/v1";

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error("Request body too large."), { statusCode: 413 }));
        req.destroy();
        return;
      }
      body += chunk;
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("Invalid JSON body."), { statusCode: 400 }));
      }
    });

    req.on("error", reject);
  });
}

/**
 * Starts the versioned HTTP API server.
 *
 * @param {{
 *   host?: string,
 *   port?: number,
 *   scanService: {
 *     createScan: (input: { repoRoot: string }) => any,
 *     listScans: () => any[],
 *     getScan: (id: string) => any,
 *     getScanReport: (id: string) => { pending: boolean, status?: string, report?: any } | null
 *   }
 * }} options
 */
export async function startApiServer(options) {
  const { scanService, host = "127.0.0.1", port = 3000 } = options;

  const server = http.createServer(async (req, res) => {
    if (!req.url || !req.method) {
      sendJson(res, 400, { error: "Malformed request." });
      return;
    }

    const url = new URL(req.url, "http://localhost");
    const pathname = url.pathname;

    if (req.method === "GET" && pathname === `${API_PREFIX}/health`) {
      sendJson(res, 200, { status: "ok", apiVersion: "v1" });
      return;
    }

    if (req.method === "POST" && pathname === `${API_PREFIX}/scans`) {
      try {
        const body = await readJsonBody(req);
        const repoRoot = typeof body.repoRoot === "string" && body.repoRoot.trim()
          ? body.repoRoot.trim()
          : process.cwd();
        const scan = scanService.createScan({ repoRoot });
        sendJson(res, 202, { scan });
      } catch (err) {
        sendJson(res, err.statusCode ?? 500, { error: err.message });
      }
      return;
    }

    if (req.method === "GET" && pathname === `${API_PREFIX}/scans`) {
      sendJson(res, 200, { scans: scanService.listScans() });
      return;
    }

    const scanMatch = pathname.match(/^\/api\/v1\/scans\/([^/]+)$/);
    if (req.method === "GET" && scanMatch) {
      const scan = scanService.getScan(decodeURIComponent(scanMatch[1]));
      if (!scan) {
        sendJson(res, 404, { error: "Scan not found." });
        return;
      }
      sendJson(res, 200, { scan });
      return;
    }

    const reportMatch = pathname.match(/^\/api\/v1\/scans\/([^/]+)\/report$/);
    if (req.method === "GET" && reportMatch) {
      const result = scanService.getScanReport(decodeURIComponent(reportMatch[1]));
      if (!result) {
        sendJson(res, 404, { error: "Scan not found." });
        return;
      }
      if (result.pending) {
        sendJson(res, 409, { error: `Scan report not ready. Current status: ${result.status}.` });
        return;
      }
      sendJson(res, 200, { report: result.report });
      return;
    }

    sendJson(res, 404, { error: "Endpoint not found." });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  const address = server.address();
  const resolvedPort = typeof address === "object" && address ? address.port : port;

  return {
    server,
    host,
    port: resolvedPort,
    baseUrl: `http://${host}:${resolvedPort}${API_PREFIX}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
