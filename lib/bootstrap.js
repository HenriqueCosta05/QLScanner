import { existsSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import fetch from 'node-fetch';
import { pipeline } from 'stream/promises';
import cliProgress from 'cli-progress';
import chalk from 'chalk';
import AdmZip from 'adm-zip';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { Transform } from 'stream';

function resolveCodeQLVersion(baseDir) {
  if (process.env.CODEQL_VERSION) return process.env.CODEQL_VERSION.trim();
  const versionFile = join(baseDir, '.codeql-version');
  if (existsSync(versionFile)) {
    return readFileSync(versionFile, 'utf8').trim();
  }
  try {
    const pkg = JSON.parse(readFileSync(join(baseDir, 'package.json')));
    if (pkg.codeqlVersion) return String(pkg.codeqlVersion).trim();
  } catch (_) {}
  return '2.22.1'; // fallback
}

export async function ensureCodeQL(baseDir) {
  const installDir = join(baseDir, 'codeql');
  const cliPath = join(installDir, 'codeql', process.platform === 'win32' ? 'codeql.exe' : 'codeql');

  if (existsSync(cliPath)) {
    try {
      execFileSync(cliPath, ['--version'], { stdio: 'ignore' });
      return cliPath;
    } catch {
      console.warn('⚠️ CodeQL encontrado mas inválido. Reinstalando...');
    }
  }

  // Baixar e instalar
  const platform = process.platform === 'win32' ? 'win64' : 'linux64';
  const ext = platform === 'win64' ? 'zip' : 'tar.gz';
  const version = resolveCodeQLVersion(baseDir);
  const bundleName = `codeql-bundle-${platform}.${ext}`;
  const url = `https://github.com/github/codeql-action/releases/download/codeql-bundle-v${version}/${bundleName}`;
  const tmpFile = join(tmpdir(), bundleName);

  console.log(chalk.blue('⬇️  Instalando CodeQL CLI…'));
  mkdirSync(installDir, { recursive: true });

  const res = await fetch(url);
  const total = +res.headers.get('content-length');
  const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  bar.start(total, 0);
  await pipeline(res.body, new ProgressStream(bar), require('fs').createWriteStream(tmpFile));
  bar.stop();

  console.log(chalk.blue('📦 Extraindo…'));
  if (ext === 'zip') {
    new AdmZip(tmpFile).extractAllTo(installDir, true);
  } else {
    await extractTarGz(tmpFile, installDir);
  }

  chmodSync(cliPath, 0o755);
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
      mkdirSync(require('path').dirname(outPath), { recursive: true });
      stream.pipe(fs.createWriteStream(outPath).on('finish', next));
    }
  });

  await pipeline(fs.createReadStream(src), createGunzip(), extract);
}
