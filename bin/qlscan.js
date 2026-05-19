#!/usr/bin/env node

import { run } from "../src/cli/index.js";

// Run the CLI application
run().catch((err) => {
  console.error("Unexpected error:", err.message);
  process.exit(1);
});
