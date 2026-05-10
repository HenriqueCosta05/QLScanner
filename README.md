# QLScanner

A hybrid Node.js package that bundles and manages CodeQL for local CLI use and HTTP API integration.

## Overview

QLScanner is a zero-setup security scanning tool that integrates CodeQL analysis into your JavaScript/TypeScript, Python, Java, C#, and Go development workflow. It automatically manages CodeQL installation, query packages, and provides clear, actionable security reports through both a local CLI and a versioned HTTP API.

## Features

- Zero-setup required - automatically manages CodeQL installation
- Pre-configured security scanning for JavaScript/TypeScript
- Automatic query pack management
- Clear, readable Markdown reports
- Pre-commit integration ready
- Optimized performance with multi-threading
- Uses official CodeQL security and quality query suite
- Dual execution model: CLI for local use and API for external integrations
- Primary language selection is explicit for both CLI and API requests
- CodeQL can be used from PATH or managed by QLScanner with update support

## Installation

```bash
npm install -g qlscanner
```

The package also exposes the shorter `qlscan` command as a CLI alias.

## Usage

Run a security scan in your JavaScript/TypeScript project:

```bash
qlscanner scan
```

The CLI will ask you to choose the primary language before the scan starts.

The tool will:
1. Set up CodeQL if not already installed
2. Download and manage required query packages
3. Create and analyze a CodeQL database
4. Generate a detailed security report in your project root

### HTTP API

Start the versioned HTTP API server for external integrations:

```bash
qlscanner serve --port 3000 --host 127.0.0.1
```

Available endpoints:

```text
GET  /api/v1/health
GET  /api/v1/scans
GET  /api/v1/options
POST /api/v1/scans
GET  /api/v1/scans/:id
GET  /api/v1/scans/:id/report
```

`GET /api/v1/options` returns the supported languages and CodeQL modes. `POST /api/v1/scans` requires a `language` field and accepts an optional `codeqlMode` field.

Create a scan from an external client:

```bash
curl -X POST http://127.0.0.1:3000/api/v1/scans \
	-H 'content-type: application/json' \
	-d '{"repositoryRoot":"/path/to/repo","language":"javascript","codeqlMode":"managed"}'
```

### Programmatic Usage

The package can also be imported directly by third-party tools and custom pipelines:

```js
import {
	createApiServer,
	createScanService,
	getLanguageProfile,
	runScan,
} from "qlscanner";

// TODO: wire the exported primitives into your own integration surface.
```

## Requirements

- Node.js 22.x or higher
- Git installed and available in PATH
- Read/write permissions for the project directory

## How It Works

QLScanner simplifies the CodeQL setup and scanning process by:
1. Managing the CodeQL CLI installation
2. Handling query pack downloads and updates
3. Creating and analyzing CodeQL databases
4. Converting complex results into readable reports
5. Maintaining a clean project structure with `.gitignore` integration

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