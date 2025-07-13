import { execFileSync, execSync } from 'child_process';
import { join } from 'path';
import chalk from 'chalk';
import {homedir} from 'os';
import { readdirSync, readFileSync, existsSync, statSync, unlinkSync } from 'fs';

export async function runScan(codeqlPath, cacheDir, repoRoot) {
  const { mkdirSync, existsSync, readFileSync, appendFileSync, writeFileSync } = await import('fs');

  const userCodeQLPath = join(homedir(), '.codeql', 'packages');
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
  const absCacheDir = join(repoRoot, '.qlscan-cache');
  if (!existsSync(absCacheDir)) {
    mkdirSync(absCacheDir, { recursive: true });
  }
  
  const dbDir = join(absCacheDir, 'db');
  const csvDir = join(absCacheDir, 'csv-output');
  const queriesDir = join(absCacheDir, 'codeql-queries');
  
  mkdirSync(queriesDir, { recursive: true });
  mkdirSync(csvDir, { recursive: true });
  
  if (!existsSync(queriesDir)) {
    mkdirSync(queriesDir, { recursive: true });
  }
    
  console.log(chalk.blue('Baixando os pacotes de queries CodeQL...'));
  const argsDownload = [
    'pack',
    'download',
    'codeql/javascript-queries@latest'
  ];
    
  try {
    execFileSync('codeql', argsDownload, {
      stdio: 'inherit',
      env: {
        ...process.env,
        CODEQL_ENABLE_NETWORK_REQUESTS: 'true'
      }
    });
  } catch (err) {
    console.error(chalk.red('Erro ao baixar o pacote de queries:'), err.message || String(err));
    if (err.stderr) {
      console.error(chalk.red('Detalhes do erro:'), err.stderr.toString());
    }
    throw err;
  }
  

  console.log(chalk.blue('Criando banco CodeQL...'));
  const argsCreate = [
    'database', 'create', dbDir,
    '--language=javascript',
    '--source-root', repoRoot,
    '--overwrite'
  ];
    
  execFileSync(codeqlPath, argsCreate, { stdio: 'inherit' });
  
  console.log(chalk.blue('Rodando análise de segurança...'));
  const argsAnalyze = [
    'database',
    'analyze',
    dbDir,
    '--format=sarif-latest',
    '--output', join(repoRoot, 'codeql-results.sarif'),
    '--threads=2',
    '--additional-packs', userCodeQLPath,
    'codeql/javascript-queries:codeql-suites/javascript-security-and-quality.qls'
  ];
        
  try {
    execFileSync('codeql', argsAnalyze, {
      stdio: 'inherit',
      env: {
        ...process.env,
        CODEQL_ENABLE_NETWORK_REQUESTS: 'true'
      }
    });
    
    const sarifContent = readFileSync(join(repoRoot, 'codeql-results.sarif'), 'utf8');
    const sarifResults = JSON.parse(sarifContent);
          
    const scanResult = {
      total: 0,
      details: []
    };
    
    if (sarifResults.runs && sarifResults.runs[0].results) {
      scanResult.total = sarifResults.runs[0].results.length;
      scanResult.details = sarifResults.runs[0].results.map(result => ({
        name: result.ruleId,
        description: result.message.text,
        severity: result.level,
        file: result.locations?.[0]?.physicalLocation?.artifactLocation?.uri,
        line: result.locations?.[0]?.physicalLocation?.region?.startLine,
        message: result.message.text
      }));
    }
    
    const mdResultFile = join(repoRoot, 'codeql-results.md');
    let mdContent = `# CodeQL Security Scan Results\n\n`;
    mdContent += `## Summary\n`;
    mdContent += `- **Scan Timestamp:** ${new Date().toISOString()}\n`;
    mdContent += `- **Total Issues Found:** ${scanResult.total}\n\n`;
    
    if (scanResult.total > 0) {
      mdContent += `## Security Issues Found\n\n`;
            
      const issuesByFile = {};
      scanResult.details.forEach(issue => {
        const file = issue.file || 'Unknown Location';
        if (!issuesByFile[file]) {
          issuesByFile[file] = [];
        }
        issuesByFile[file].push(issue);
      });
    
      for (const [file, issues] of Object.entries(issuesByFile)) {
        mdContent += `### ${file}\n\n`;
        issues.forEach((issue, index) => {
          mdContent += `${index + 1}. **${issue.name || 'Security Issue'}**\n`;
          if (issue.description) mdContent += `   - Description: ${issue.description}\n`;
          if (issue.severity) mdContent += `   - Severity: ${issue.severity}\n`;
          if (issue.line) mdContent += `   - Line: ${issue.line}\n`;
          mdContent += '\n';
        });
      }
    } else {
      mdContent += `## No Security Issues Found\n\nThe scan completed successfully and no security issues were detected.\n`;
    }
    
    mdContent += `\n## Scan Information\n`;
    mdContent += `- **Scanned Directory:** ${repoRoot}\n`;
    mdContent += `- **CodeQL Database:** ${dbDir}\n`;
    mdContent += `- **Analysis Type:** JavaScript Security Scan\n`;
    
    writeFileSync(mdResultFile, mdContent);
    
    unlinkSync(join(repoRoot, 'codeql-results.sarif'));
    
    if (scanResult.total === 0) {
      console.log(chalk.green('Nenhuma vulnerabilidade foi detectada pelo CodeQL.'));
    } else {
      console.log(chalk.yellow(`⚠️  ${scanResult.total} vulnerabilidade(s) encontrada(s) pelo CodeQL.`));
    }
    console.log(chalk.blue(`Relatório detalhado salvo em ${mdResultFile}`));
    
    return scanResult.total;
  } catch (err) {
    console.error(chalk.red('Ocorreu um erro ao analisar o código:'), err.message || String(err));
    if (err.stderr) {
      console.error(chalk.red('Detalhes do erro:'), err.stderr.toString());
    }
    throw err;
  }

  function countCsvProblems(csvDir) {
    if (!existsSync(csvDir)) return { total: 0, details: [] };
    let stat;
    try {
      stat = statSync(csvDir);
    } catch {
      return { total: 0, details: [] };
    }
    if (!stat.isDirectory()) return { total: 0, details: [] };

    let total = 0;
    const details = [];

    for (const file of readdirSync(csvDir)) {
      if (!file.endsWith('.csv')) continue;
      
      try {
        const content = readFileSync(join(csvDir, file), 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        
        if (lines.length <= 1) continue;
        
        const header = lines[0].split(',').map(h => h.trim());
        const rows = lines.slice(1);
        
        for (const row of rows) {
          try {
            const cells = row.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''));
            if (cells.length !== header.length) {
              console.warn(`Warning: Mismatched columns in ${file}`);
              continue;
            }
            
            const issue = {};
            header.forEach((key, index) => {
              issue[key.toLowerCase()] = cells[index] || '';
            });
            details.push(issue);
          } catch (rowErr) {
            console.warn(`Warning: Failed to parse row in ${file}:`, rowErr);
            continue;
          }
        }
        
        total += rows.length;
      } catch (fileErr) {
        console.error(`Error processing ${file}:`, fileErr);
        continue;
      }
    }
    
    return { total, details };
  }
}