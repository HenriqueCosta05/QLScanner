export async function waitForStatus(getScan, id, expected) {
  for (let i = 0; i < 40; i += 1) {
    const scan = await getScan(id);
    if (scan?.status === expected) return scan;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for status ${expected}`);
}
