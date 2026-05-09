const MAX_POLL_ATTEMPTS = 40;
const POLL_INTERVAL_MS = 10;

export async function waitForStatus(getScan, id, expected) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const scan = await getScan(id);
    if (scan?.status === expected) return scan;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`Timed out waiting for status ${expected}`);
}
