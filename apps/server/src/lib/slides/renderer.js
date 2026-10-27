import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ensureStorageDir } from './storage.js';

function existsFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function findOnPath(names) {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (existsFile(candidate)) return candidate;
    }
  }
  return null;
}

function findPopplerBinary(name) {
  const envKey = name === 'pdftoppm' ? 'PDFTOPPM_PATH' : name === 'pdfinfo' ? 'PDFINFO_PATH' : null;
  if (envKey && process.env[envKey] && existsFile(process.env[envKey])) return process.env[envKey];

  const onPath = findOnPath(process.platform === 'win32' ? [`${name}.exe`, name] : [name]);
  if (onPath) return onPath;

  if (process.platform === 'win32') {
    const wingetRoot = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
    try {
      for (const pkg of fs.readdirSync(wingetRoot)) {
        if (!/poppler/i.test(pkg)) continue;
        const pkgDir = path.join(wingetRoot, pkg);
        for (const sub of fs.readdirSync(pkgDir)) {
          const binDir = path.join(pkgDir, sub, 'Library', 'bin');
          const candidate = path.join(binDir, `${name}.exe`);
          if (existsFile(candidate)) return candidate;
        }
      }
    } catch {}
  }
  return null;
}

export function resolveSofficeBinary() {
  const configured = process.env.LIBREOFFICE_PATH || process.env.SOFFICE_PATH;
  if (configured && existsFile(configured)) return configured;
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe'
    ];
    return candidates.find(existsFile) || findOnPath(['soffice.exe']);
  }
  return findOnPath(['soffice', 'libreoffice']);
}

export function resolvePdftoppmBinary() {
  return findPopplerBinary('pdftoppm');
}

export function resolvePdfinfoBinary() {
  return findPopplerBinary('pdfinfo');
}

export function rendererStatus() {
  const soffice = resolveSofficeBinary();
  const pdftoppm = resolvePdftoppmBinary();
  return {
    libreOffice: soffice || null,
    pdftoppm: pdftoppm || null,
    available: Boolean(soffice && pdftoppm)
  };
}

function runProcess(command, args, { timeoutMs = 15 * 60 * 1000, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { child.kill('SIGKILL'); } catch {}
      reject(new Error(`Rendering process timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { if (stdout.length < 2_000_000) stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { if (stderr.length < 2_000_000) stderr += chunk.toString(); });
    child.on('error', (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(command)} exited with code ${code}: ${stderr || stdout}`.trim()));
    });
  });
}

export async function convertPptxToPdf(inputPath, outputDir) {
  const soffice = resolveSofficeBinary();
  if (!soffice) {
    throw Object.assign(
      new Error('LibreOffice is not installed. Install LibreOffice or set LIBREOFFICE_PATH to enable slide rendering.'),
      { code: 'RENDERER_MISSING' }
    );
  }
  ensureStorageDir(outputDir);
  const profileDir = path.join(outputDir, `.lo-profile-${process.pid}-${Date.now()}`);
  ensureStorageDir(profileDir);
  const profileUrl = pathToFileURL(profileDir).href;

  try {
    await runProcess(
      soffice,
      [
        '--headless',
        '--norestore',
        '--nolockcheck',
        '--nodefault',
        '--nofirststartwizard',
        `-env:UserInstallation=${profileUrl}`,
        '--convert-to',
        'pdf:impress_pdf_Export',
        '--outdir',
        outputDir,
        inputPath
      ],
      { timeoutMs: 20 * 60 * 1000 }
    );
  } finally {
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
  }

  const expected = path.join(outputDir, `${path.basename(inputPath, path.extname(inputPath))}.pdf`);
  if (existsFile(expected)) return expected;
  const pdfs = fs.readdirSync(outputDir).filter(name => name.toLowerCase().endsWith('.pdf'));
  if (!pdfs.length) throw new Error('LibreOffice did not produce a PDF for this presentation.');
  return path.join(outputDir, pdfs[0]);
}

function naturalSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

async function renderPdfPages(pdfPath, outputDir, prefix, extraArgs) {
  const pdftoppm = resolvePdftoppmBinary();
  if (!pdftoppm) {
    throw Object.assign(
      new Error('Poppler pdftoppm is not installed. Install Poppler or set PDFTOPPM_PATH to render slide images.'),
      { code: 'RENDERER_MISSING' }
    );
  }
  ensureStorageDir(outputDir);
  for (const name of fs.readdirSync(outputDir)) {
    if (name.startsWith(`${prefix}-`) && /\.(jpg|jpeg|png)$/i.test(name)) {
      try { fs.unlinkSync(path.join(outputDir, name)); } catch {}
    }
  }
  const outPrefix = path.join(outputDir, prefix);
  await runProcess(
    pdftoppm,
    ['-jpeg', '-jpegopt', 'quality=82', ...extraArgs, pdfPath, outPrefix],
    { timeoutMs: 20 * 60 * 1000 }
  );

  const generated = fs.readdirSync(outputDir)
    .filter(name => name.startsWith(`${prefix}-`) && /\.jpe?g$/i.test(name))
    .sort(naturalSort);

  const normalized = [];
  generated.forEach((name, index) => {
    const number = index + 1;
    const padded = String(number).padStart(4, '0');
    const finalName = `${prefix}-${padded}.jpg`;
    const source = path.join(outputDir, name);
    const target = path.join(outputDir, finalName);
    if (source !== target) {
      try { fs.renameSync(source, target); } catch {}
    }
    normalized.push(finalName);
  });
  return normalized;
}

export async function renderSlides(pdfPath, previewDir, thumbDir) {
  const previewFiles = await renderPdfPages(pdfPath, previewDir, 'slide', ['-r', '96']);
  const thumbFiles = await renderPdfPages(pdfPath, thumbDir, 'thumb', [
    '-scale-to-x', '320',
    '-scale-to-y', '180'
  ]).catch(() => []);
  return {
    previewFiles,
    thumbFiles,
    pageCount: previewFiles.length
  };
}

export async function readPdfPageCount(pdfPath) {
  const pdfinfo = resolvePdfinfoBinary();
  if (!pdfinfo) return null;
  try {
    const { stdout } = await runProcess(pdfinfo, [pdfPath], { timeoutMs: 60_000 });
    const match = stdout.match(/Pages:\s+(\d+)/i);
    return match ? parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}
