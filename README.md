# QLScanner

A cross-platform CLI (Node.js) that orchestrates the external CodeQL CLI for pre-commit scanning of JavaScript.

## Overview

QLScanner is a security-scanning orchestrator that integrates the external CodeQL CLI into your JavaScript/TypeScript workflow. By default QLScanner does not embed, distribute, or modify CodeQL binaries — the user is expected to install and license CodeQL separately. For convenience, an optional automatic download can be enabled via an environment variable (see "Prerequisites" below).

## Features

- Orchestrates an externally installed CodeQL CLI
- Pre-configured security scanning for JavaScript/TypeScript
- Query pack management (uses official CodeQL query suites)
- Clear, readable Markdown reports
- Pre-commit integration ready
- Optimized performance with multi-threading

## Installation

```bash
npm install -g qlscan
```

## Usage

Run a security scan in your JavaScript/TypeScript project:

```bash
qlscan scan
```

The tool will:
1. Set up CodeQL if not already installed
2. Download and manage required query packages
3. Create and analyze a CodeQL database
4. Generate a detailed security report in your project root

## Prerequisites

- A licensed CodeQL CLI installed and available on your `PATH`, or the absolute path set via the `CODEQL_PATH` environment variable.
- Node.js 22.x or higher
- Git installed and available in `PATH`
- Read/write permissions for the project directory

Note on automatic downloads: QLScanner can optionally download a CodeQL bundle when `QLSCAN_ALLOW_DOWNLOAD=true` is set in the environment. This behavior is disabled by default to avoid distributing or modifying proprietary binaries in compliance-sensitive environments. Prefer manual installation where license/compliance is a concern.

## How It Works

QLScanner simplifies running CodeQL scans by:
1. Orchestrating the external CodeQL CLI and query packs
2. Creating and analyzing CodeQL databases
3. Converting complex results into readable reports
4. Maintaining a clean project structure with `.gitignore` integration

## Output

Scan results are saved in `codeql-results.md` in your project root, containing:
- Summary of findings
- Detailed vulnerability descriptions
- File locations and line numbers
- Severity levels
- Actionable fix suggestions

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

ISC License

## Author

Henrique Costa