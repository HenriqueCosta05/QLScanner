# QLScanner

A cross-platform CLI (Node.js) that bundles and manages CodeQL for pre-commit scanning of JavaScript.

## Overview

QLScanner is a zero-setup security scanning tool that integrates CodeQL analysis into your JavaScript/TypeScript development workflow. It automatically manages CodeQL installation, query packages, and provides clear, actionable security reports.

## Features

- Zero-setup required - automatically manages CodeQL installation
- Pre-configured security scanning for JavaScript/TypeScript
- Automatic query pack management
- Clear, readable Markdown reports
- Pre-commit integration ready
- Optimized performance with multi-threading
- Uses official CodeQL security and quality query suite

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