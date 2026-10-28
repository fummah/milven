import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { resolvePdftoppmBinary } from './slides/renderer.js';

const inflight = new Map();

function existsFile(file) {
  try { return fs.statSync(file).isFile(); } catch { return false; }
}

function runProcess(command, args, { timeoutMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { child.kill('SIGKILL'); } catch {}
      reject(new Error('Thumbnail rendering timed out.'));
    }, timeoutMs);

    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', err => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', code => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `pdftoppm exited with code ${code}`));
    });
  });
}

export async function generatePdfThumbnail(pdfPath, outputPath, { width = 640, timeoutMs = 60000 } = {}) {
  if (existsFile(outputPath)) return outputPath;
  if (!existsFile(pdfPath)) throw new Error('PDF file is missing.');
  if (inflight.has(outputPath)) return inflight.get(outputPath);

  const task = (async () => {
    const pdftoppm = resolvePdftoppmBinary();
    if (!pdftoppm) {
      throw Object.assign(new Error('Poppler pdftoppm is not installed. Set PDFTOPPM_PATH to enable PDF thumbnails.'), { code: 'RENDERER_MISSING' });
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const tempPrefix = path.join(
      path.dirname(outputPath),
      `.thumbnail-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    const tempFile = `${tempPrefix}.png`;
    try {
      await runProcess(pdftoppm, [
        '-f', '1',
        '-l', '1',
        '-singlefile',
        '-png',
        '-scale-to', String(width),
        pdfPath,
        tempPrefix
      ], { timeoutMs });
      if (!existsFile(tempFile)) throw new Error('Thumbnail renderer produced no image.');
      fs.copyFileSync(tempFile, outputPath);
      return outputPath;
    } finally {
      try { fs.rmSync(tempFile, { force: true }); } catch {}
    }
  })();

  inflight.set(outputPath, task);
  try {
    return await task;
  } finally {
    inflight.delete(outputPath);
  }
}
