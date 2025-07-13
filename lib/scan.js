import { execFileSync, execSync } from 'child_process';
import { join } from 'path';
import chalk from 'chalk';
import { readdirSync, readFileSync, existsSync } from 'fs';

export async function runScan(codeqlPath, cacheDir, repoRoot) {
  const dbDir = join(cacheDir, 'db');
  const csvDir = join(cacheDir, 'csv-output');

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
  console.log(chalk.green(`Scan finalizado. ${issues} problema(s) detectado(s).`));
  return issues;
}

function countCsvProblems(csvDir) {
  if (!existsSync(csvDir)) return 0;
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
