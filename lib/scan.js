import { execFileSync, execSync } from 'child_process';
import { join } from 'path';
import chalk from 'chalk';
import { readdirSync, readFileSync, existsSync } from 'fs';

export async function runScan(codeqlPath, cacheDir, repoRoot) {
  const { mkdirSync, existsSync, readFileSync, appendFileSync, writeFileSync } = await import('fs');
  // Ensure only the exact .qlscan-cache/ folder is ignored in .gitignore at repo root
  const gitignorePath = join(repoRoot, '.gitignore');
  let shouldAddIgnore = true;
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf8');
    // Only match a line that is exactly '.qlscan-cache/' (optionally with whitespace)
    if (content.split(/\r?\n/).some(line => line.trim() === '.qlscan-cache/')) {
      shouldAddIgnore = false;
    }
  }
  if (shouldAddIgnore) {
    const line = '.qlscan-cache/\n';
    if (existsSync(gitignorePath)) {
      appendFileSync(gitignorePath, line);
    } else {
      writeFileSync(gitignorePath, line);
    }
  }
  // Always resolve cacheDir relative to repoRoot
  const absCacheDir = join(repoRoot, '.qlscan-cache');
  if (!existsSync(absCacheDir)) {
    mkdirSync(absCacheDir, { recursive: true });
  }
  const dbDir = join(absCacheDir, 'db');
  const csvDir = join(absCacheDir, 'csv-output');

  const argsCreate = [
    'database', 'create', dbDir,
    '--language=javascript',
    '--build-mode=none', `--source-root=${repoRoot}`, '--threads=2', '--overwrite'
  ];
  execFileSync(codeqlPath, argsCreate, { stdio: 'inherit' });

  const argsAnalyze = [
    'database', 'analyze', dbDir,
    '--format=csv', `--output=${csvDir}`,
    '--threads=2'
  ];
  execFileSync(codeqlPath, argsAnalyze, { stdio: 'inherit' });

  const issues = countCsvProblems(csvDir);
  // Write the result to a file in the cache directory
  const resultFile = join(absCacheDir, 'scan-result.txt');
  writeFileSync(resultFile, String(issues));
  console.log(chalk.green(`Scan finalizado. ${issues} problema(s) detectado(s).`));
  return issues;
}

function countCsvProblems(csvDir) {
  if (!existsSync(csvDir)) return 0;
  // Check if csvDir is a directory
  const { statSync } = require('fs');
  let stat;
  try {
    stat = statSync(csvDir);
  } catch {
    return 0;
  }
  if (!stat.isDirectory()) return 0;
  let total = 0;
  for (const file of readdirSync(csvDir)) {
    if (!file.endsWith('.csv')) continue;
    const rows = readFileSync(join(csvDir, file), 'utf8')
      .split('\n')
      .filter((line, i) => line.trim() && i > 0); // skip header
    total += rows.length;
  }
  return total;
}
