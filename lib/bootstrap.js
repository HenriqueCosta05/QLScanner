import fetch from 'node-fetch';
import { tmpdir } from 'os';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import { createWriteStream, mkdirSync, existsSync, chmodSync, statSync } from 'fs';
import { join, basename, dirname } from 'path';
import AdmZip from 'adm-zip';
import cliProgress from 'cli-progress';
import chalk from 'chalk';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import pkg from 'which';

function resolveCodeQLVersion(baseDir) {
  if (process.env.CODEQL_VERSION) return process.env.CODEQL_VERSION.trim();
  const versionFile = join(baseDir, '.codeql-version');
  if (existsSync(versionFile)) return readFileSync(versionFile, 'utf8').trim();
  try {
    const pkgJson = JSON.parse(readFileSync(join(baseDir, 'package.json')));
    if (pkgJson.codeqlVersion) return String(pkgJson.codeqlVersion).trim();
  } catch (_) {}
  return '2.22.1';
}

export async function ensureCodeQL(baseDir) {

  if (existsSync(cliPath)) {
    try {
      execFileSync(cliPath, ['--version'], { stdio: 'ignore' });
      return cliPath; // ✅ Já está instalado e funcionando
    } catch {
      console.warn('⚠️ CodeQL encontrado mas inválido. Tentando reinstalar...');
    }
  }

  // ❌ Se chegou aqui, precisa instalar
  console.log('⬇️ Instalando CodeQL CLI...');

  const platform = process.platform === 'win32' ? 'win64' : 'linux64';
  const ext = platform === 'win64' ? 'zip' : 'tar.gz';
  const bundleName = `codeql-bundle-${platform}.${ext}`;
  const version = resolveCodeQLVersion(baseDir);
  const url = `https://github.com/github/codeql-action/releases/download/codeql-bundle-v${version}/${bundleName}`;
  const installDir = join(baseDir, '.qscan-cache', 'codeql');
  const cliPath = platform === 'win64'
    ? join(installDir, 'codeql', 'codeql.exe')
    : join(installDir, 'codeql', 'codeql');

  if (existsSync(cliPath)) {
    if (isExecutable(cliPath)) return cliPath;
    else throw new Error(`CodeQL CLI encontrado em ${cliPath}, mas não é executável (status 126). Verifique permissões ou arquitetura.`);
  }

  mkdirSync(installDir, { recursive: true });
  const tmpFile = join(tmpdir(), bundleName);

  console.log(chalk.blue('⬇️ Baixando CodeQL CLI…'));
  const res = await fetch(url);
  const total = +res.headers.get('content-length');
  const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  bar.start(total, 0);
  await pipeline(res.body, new ProgressStream(bar), createWriteStream(tmpFile));
  bar.stop();

  console.log(chalk.blue('📦 Extraindo CodeQL CLI…'));
  if (ext === 'zip') {
    new AdmZip(tmpFile).extractAllTo(installDir, true);
  } else {
    await extractTarGz(tmpFile, installDir);
  }

  // Torna executável e valida
  chmodSync(cliPath, 0o755);
  if (!isExecutable(cliPath)) {
    throw new Error(`CodeQL CLI baixado, mas não pôde ser executado. Verifique arquitetura, dependências e permissões.`);
  }

  return cliPath;
}

function isExecutable(cliPath) {
  try {
    const stats = statSync(cliPath);
    if (!(stats.mode & 0o111)) {
      chmodSync(cliPath, 0o755);
    }
    const output = execFileSync(cliPath, ['--version'], { stdio: 'pipe' }).toString().trim();
    console.log(chalk.green(`✔️ CodeQL CLI funcionando: ${output}`));
    return true;
  } catch (err) {
    if (err.status === 126) {
      console.error(chalk.red(`🚫 O arquivo ${cliPath} não tem permissão de execução (status 126).`));
    } else {
      console.error(chalk.red(`🚫 Falha ao executar CodeQL CLI: ${err.message}`));
    }
    return false;
  }
}

class ProgressStream extends Transform {
  constructor(bar) {
    super();
    this.bar = bar;
    this.count = 0;
  }
  _transform(chunk, enc, cb) {
    this.count += chunk.length;
    this.bar.update(this.count);
    this.push(chunk);
    cb();
  }
}

async function extractTarGz(src, dest) {
  const { createGunzip } = await import('zlib');
  const tar = await import('tar-stream');
  const fs = await import('fs');
  const extract = tar.extract();
  extract.on('entry', (header, stream, next) => {
    const outPath = join(dest, header.name);
    if (header.type === 'directory') {
      mkdirSync(outPath, { recursive: true });
      stream.resume();
      next();
    } else {
      mkdirSync(dirname(outPath), { recursive: true });
      stream.pipe(fs.createWriteStream(outPath).on('finish', next));
    }
  });
  await pipeline(
    fs.createReadStream(src),
    createGunzip(),
    extract
  );
}
