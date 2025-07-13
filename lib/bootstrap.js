import { existsSync, mkdirSync, chmodSync, writeFileSync, readFileSync, createWriteStream, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';
import fetch from 'node-fetch';
import { pipeline } from 'stream/promises';
import cliProgress from 'cli-progress';
import chalk from 'chalk';
import AdmZip from 'adm-zip';
import { execFileSync } from 'child_process';
import { Transform } from 'stream';

const CODEQL_INSTALL_DIR = join(homedir(), '.qlscan', 'codeql');


function fixExecPermissionsRecursively(dir) {
  for (const item of readdirSync(dir)) {
    const fullPath = join(dir, item);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      fixExecPermissionsRecursively(fullPath);
    } else if (stats.isFile()) {
      try {
        chmodSync(fullPath, 0o755);
      } catch (_) {
        // Ignora erros silenciosamente
      }
    }
  }
}


export async function ensureCodeQL() {
  const platform = process.platform === 'win32' ? 'win64' : 'linux64';
  const ext = platform === 'win64' ? 'zip' : 'tar.gz';
  const version = await resolveLatestCodeQLVersion();
  const cliPath = join(CODEQL_INSTALL_DIR, 'codeql', process.platform === 'win32' ? 'codeql.exe' : 'codeql');

  if (existsSync(cliPath)) {
    try {
      execFileSync(cliPath, ['--version'], { stdio: 'ignore' });
      return cliPath;
    } catch {
      console.warn(chalk.yellow('⚠️ CodeQL instalado está corrompido. Reinstalando...'));
    }
  }

  // Download and extract
  const bundleName = `codeql-bundle-${platform}.${ext}`;
  const url = `https://github.com/github/codeql-action/releases/download/codeql-bundle-v${version}/${bundleName}`;
  const tmpFile = join(tmpdir(), bundleName);

  console.log(chalk.blue(`⬇️ Baixando CodeQL CLI versão ${version}…`));
  mkdirSync(CODEQL_INSTALL_DIR, { recursive: true });

  let res;
  try {
    res = await fetch(url);
    if (!res.ok) throw new Error(`Falha ao baixar CodeQL: ${res.statusText}`);
    const total = +(res.headers.get('content-length') || 0);
    let bar;
    if (total > 0) {
      bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
      bar.start(total, 0);
      await pipeline(res.body, new ProgressStream(bar), createWriteStream(tmpFile));
      bar.stop();
    } else {
      await pipeline(res.body, createWriteStream(tmpFile));
    }
  } catch (err) {
    console.error(chalk.red('❌ Erro ao baixar CodeQL:'), err);
    try { if (existsSync(tmpFile)) require('fs').unlinkSync(tmpFile); } catch {}
    throw err;
  }

  console.log(chalk.blue('📦 Extraindo CodeQL…'));
  try {
    if (ext === 'zip') {
      new AdmZip(tmpFile).extractAllTo(CODEQL_INSTALL_DIR, true);
    } else {
      await extractTarGz(tmpFile, CODEQL_INSTALL_DIR);
    }
  } catch (err) {
    console.error(chalk.red('❌ Erro ao extrair CodeQL:'), err);
    throw err;
  } finally {
    try { if (existsSync(tmpFile)) require('fs').unlinkSync(tmpFile); } catch {}
  }

  fixExecPermissionsRecursively(CODEQL_INSTALL_DIR);
  if (existsSync(cliPath)) {
    try { chmodSync(cliPath, 0o755); } catch {}
  }
  writeFileSync(join(CODEQL_INSTALL_DIR, 'version.txt'), version);

  console.log(chalk.green('✅ CodeQL instalado com sucesso.'));
  return cliPath;
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
      mkdirSync(join(dest, header.name.split('/').slice(0, -1).join('/')), { recursive: true });
      stream.pipe(fs.createWriteStream(outPath).on('finish', next));
    }
  });

  await pipeline(fs.createReadStream(src), createGunzip(), extract);
}

async function resolveLatestCodeQLVersion() {
  const cacheFile = join(CODEQL_INSTALL_DIR, 'version.txt');
  if (existsSync(cacheFile)) {
    return readFileSync(cacheFile, 'utf8').trim();
  }

  console.log(chalk.gray('🔍 Buscando última versão do CodeQL no GitHub...'));
  const res = await fetch('https://api.github.com/repos/github/codeql-action/releases/latest', {
    headers: { 'User-Agent': 'qlscan-cli' }
  });
  if (!res.ok) throw new Error(`Erro ao obter versão do CodeQL: ${res.statusText}`);
  const json = await res.json();
  const tag = json.tag_name || '';
  const version = tag.replace(/^codeql-bundle-v/, '');
  return version;
}
