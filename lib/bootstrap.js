import fetch from 'node-fetch';
import { tmpdir } from 'os';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import { createWriteStream, mkdirSync, existsSync, chmodSync } from 'fs';
import { join, basename } from 'path';
import AdmZip from 'adm-zip';
import cliProgress from 'cli-progress';
import chalk from 'chalk';

const VERSION = '2.22.2';

export async function ensureCodeQL(baseDir) {
  const platform = process.platform === 'win32' ? 'win64' : 'linux64';
  const ext = platform === 'win64' ? 'zip' : 'tar.gz';
  const bundleName = `codeql-bundle-${platform}.${ext}`;
  const url = `https://github.com/github/codeql-action/releases/download/codeql-bundle-v${VERSION}/${bundleName}`;
  const installDir = join(baseDir, 'codeql');
  const cliPath = platform === 'win64'
    ? join(installDir, 'codeql', 'codeql.exe')
    : join(installDir, 'codeql', 'codeql');

  if (existsSync(cliPath)) return cliPath;

  mkdirSync(installDir, { recursive: true });
  const tmpFile = join(tmpdir(), bundleName);
  console.log(chalk.blue('Instalando a CLI do CodeQL…')); 
  const res = await fetch(url);
  const total = +res.headers.get('content-length');
  const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  bar.start(total, 0);
  await pipeline(res.body, new ProgressStream(bar), createWriteStream(tmpFile));
  bar.stop();

  console.log(chalk.blue('Extraindo a CLI do CodeQL…'));
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
