import { execFileSync } from 'child_process';
import { join } from 'path';
import chalk from 'chalk';
import { readFileSync, existsSync } from 'fs';

export async function runScan(codeqlPath, cacheDir, repoRoot) {
  const dbDir = join(cacheDir, 'db');
  const argsCreate = [
    'database', 'create', dbDir,
    '--language=javascript', '--language=python', '--language=csharp',
    '--build-mode=none', `--source-root=${repoRoot}`, '--threads=2', '--overwrite'
  ];
  execFileSync(codeqlPath, argsCreate, { stdio: 'inherit' });
  const sarif = join(cacheDir, 'results.sarif');
  const argsAnalyze = ['database', 'analyze', dbDir, '--format=sarifv2.1.0', `--output=${sarif}`];
  execFileSync(codeqlPath, argsAnalyze, { stdio: 'inherit' });
  const issues = countSarifProblems(sarif);
  console.log(chalk.green(`Escaneamento finalizado. ${issues} problema(s) detectado(s).`));
  return issues;
}

function countSarifProblems(path) {
  if (!existsSync(path)) return 0;
  const json = JSON.parse(readFileSync(path));
  return json.runs?.[0]?.results?.length || 0;
}