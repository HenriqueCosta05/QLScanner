import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { ensureCodeQL } from '../lib/bootstrap.js';
import { runScan } from '../lib/scan.js';
import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'fs';
import { execSync } from 'child_process';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TOOL_HOME = join(process.cwd(), '.qscan-cache');

const argv = yargs(hideBin(process.argv))
  .command('init-hook', 'Instalação do hook de pré-commit', () => {}, async () => {
    const hookDir = join(process.cwd(), '.git', 'hooks');
    const hookFile = join(hookDir, 'pre-commit');
    if (!existsSync(hookDir)) {
      console.error('Não é um repositório Git. Por favor, verifique seu projeto e tente novamente.');
      process.exit(1);
    }
    const stub = `#!/usr/bin/env bash\nqscan hook\n`;
    writeFileSync(hookFile, stub);
    chmodSync(hookFile, 0o755);
    console.log(chalk.green('✓ Hook de pré-commit instalado.'));
  })
  .command('hook', 'Interno: Execução do Hook', () => {}, async () => {
    try {
      const codeql = await ensureCodeQL(TOOL_HOME);
      const changed = execSync('git diff --cached --name-only --diff-filter=ACM').toString();
      if (!changed.match(/\.(js|py|cs)$/)) process.exit(0);
      const issues = await runScan(codeql, TOOL_HOME, process.cwd());
      if (issues > 0) {
        console.log(chalk.yellow(`⚠️  ${issues} vulnerabilidade(s) encontrada(s) pelo CodeQL.`));
        const answer = await prompt('Tem certeza que deseja continuar? [y/N]: ');
        if (!/^y(es)?$/i.test(answer.trim())) process.exit(1);
      }
    } catch (e) {
      console.error(chalk.red(e.message));
      process.exit(1);
    }
  })
  .command('scan', 'Escaneamento manual do repositório atual', () => {}, async () => {
    const codeql = await ensureCodeQL(TOOL_HOME);
    await runScan(codeql, TOOL_HOME, process.cwd());
  })
  .demandCommand(1)
  .help()
  .argv;

function prompt(q) {
  return new Promise(resolve => {
    process.stdout.write(q);
    process.stdin.once('data', d => resolve(d.toString()));
  });
}
