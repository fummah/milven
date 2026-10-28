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

function resolveFcListBinary() {
  return findOnPath(process.platform === 'win32' ? ['fc-list.exe', 'fc-list'] : ['fc-list']);
}

function resolveFcMatchBinary() {
  return findOnPath(process.platform === 'win32' ? ['fc-match.exe', 'fc-match'] : ['fc-match']);
}

export function rendererStatus() {
  const soffice = resolveSofficeBinary();
  const pdftoppm = resolvePdftoppmBinary();
  return {
    libreOffice: soffice || null,
    pdftoppm: pdftoppm || null,
    fontConfig: Boolean(resolveFcListBinary()) || process.platform === 'win32',
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

let rendererInfoPromise = null;
export function getRendererInfo() {
  if (rendererInfoPromise) return rendererInfoPromise;
  rendererInfoPromise = (async () => {
    const soffice = resolveSofficeBinary();
    const pdftoppm = resolvePdftoppmBinary();
    let version = process.env.LIBREOFFICE_VERSION || null;
    // Windows LibreOffice can hang on `--version` when another instance is
    // running, so only probe the version automatically on Linux containers.
    if (!version && soffice && process.platform !== 'win32') {
      try {
        const { stdout } = await runProcess(soffice, ['--version'], { timeoutMs: 10_000 });
        version = String(stdout || '').split(/\r?\n/).find(Boolean)?.trim() || null;
      } catch {}
    }
    return {
      engine: 'LibreOffice Impress',
      version,
      converter: soffice || null,
      rasterizer: pdftoppm || null
    };
  })();
  return rendererInfoPromise;
}

function normalizeFamily(value) {
  return String(value || '').toLowerCase().replace(/['"]/g, '').replace(/\s+/g, ' ').trim();
}

export async function listInstalledFontFamilies() {
  const fcList = resolveFcListBinary();
  if (fcList) {
    try {
      const { stdout } = await runProcess(fcList, ['--format', '%{family}\n'], { timeoutMs: 30_000 });
      const families = stdout
        .split(/\r?\n/)
        .flatMap(line => line.split(','))
        .map(line => line.trim())
        .filter(Boolean);
      return { available: true, source: 'fc-list', families: [...new Set(families)] };
    } catch (err) {
      return { available: false, source: 'fc-list', families: [], error: String(err?.message || err) };
    }
  }

  if (process.platform === 'win32') {
    try {
      const script = 'Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }';
      const { stdout } = await runProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeoutMs: 30_000 });
      const families = stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      return { available: true, source: 'windows-fonts', families: [...new Set(families)] };
    } catch (err) {
      return { available: false, source: 'windows-fonts', families: [], error: String(err?.message || err) };
    }
  }

  return { available: false, source: 'none', families: [], error: 'Font enumeration is unavailable on this host.' };
}

export async function detectFontSupport(requiredFonts = []) {
  const installed = await listInstalledFontFamilies();
  const normalizedFamilies = new Set(installed.families.map(normalizeFamily));
  const missingFonts = [];
  const substitutions = {};

  for (const family of requiredFonts) {
    const normalized = normalizeFamily(family);
    if (!normalized) continue;
    if (!normalizedFamilies.has(normalized)) {
      missingFonts.push(family);
      const fcMatch = resolveFcMatchBinary();
      if (fcMatch) {
        try {
          const { stdout } = await runProcess(fcMatch, ['--format', '%{family}', family], { timeoutMs: 15_000 });
          const match = String(stdout || '').split(',').map(v => v.trim()).filter(Boolean)[0];
          if (match) substitutions[family] = match;
        } catch {}
      }
    }
  }

  return {
    available: installed.available,
    source: installed.source,
    installedCount: installed.families.length,
    missingFonts,
    substitutions,
    error: installed.error || null
  };
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
  const baseArgs = [
    '--headless',
    '--norestore',
    '--nolockcheck',
    '--nodefault',
    '--nofirststartwizard',
    `-env:UserInstallation=${profileUrl}`
  ];

  try {
    // LibreOffice's PDF export keeps text and vector graphics as vectors. The
    // CLI JSON filter-data form is not reliably parsed on every platform, so
    // use the stable named filter and control image quality at raster time.
    await runProcess(
      soffice,
      [...baseArgs, '--convert-to', 'pdf:impress_pdf_Export', '--outdir', outputDir, inputPath],
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

async function renderPdfPages(pdfPath, outputDir, prefix, {
  format = 'png',
  scale = 1920,
  jpegQuality = 86
} = {}) {
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
  const scaleArgs = scale ? ['-scale-to', String(scale)] : [];
  const args = format === 'png'
    ? ['-png', ...scaleArgs, '-aa', 'yes', '-aaVector', 'yes', pdfPath, outPrefix]
    : ['-jpeg', '-jpegopt', `quality=${jpegQuality}`, ...scaleArgs, '-aa', 'yes', '-aaVector', 'yes', pdfPath, outPrefix];

  await runProcess(pdftoppm, args, { timeoutMs: 20 * 60 * 1000 });

  const extension = format === 'png' ? 'png' : 'jpg';
  const generated = fs.readdirSync(outputDir)
    .filter(name => name.startsWith(`${prefix}-`) && new RegExp(`\\.${extension}$`, 'i').test(name))
    .sort(naturalSort);

  const normalized = [];
  generated.forEach((name, index) => {
    const padded = String(index + 1).padStart(4, '0');
    const finalName = `${prefix}-${padded}.${extension}`;
    const source = path.join(outputDir, name);
    const target = path.join(outputDir, finalName);
    if (source !== target) {
      try { fs.renameSync(source, target); } catch {}
    }
    normalized.push(finalName);
  });
  return normalized;
}

export async function renderSlides(pdfPath, previewDir, thumbDir, {
  previewWidth = Number(process.env.SLIDES_PREVIEW_WIDTH) || 1920,
  thumbWidth = Number(process.env.SLIDES_THUMB_WIDTH) || 480,
  previewFormat = process.env.SLIDES_PREVIEW_FORMAT === 'jpeg' ? 'jpeg' : 'png'
} = {}) {
  const previewFiles = await renderPdfPages(pdfPath, previewDir, 'slide', {
    format: previewFormat,
    scale: previewWidth
  });
  const thumbFiles = await renderPdfPages(pdfPath, thumbDir, 'thumb', {
    format: 'jpeg',
    scale: thumbWidth,
    jpegQuality: 86
  }).catch(() => []);
  return {
    previewFiles,
    thumbFiles,
    previewFormat,
    pageCount: previewFiles.length
  };
}

export function readImageDimensions(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(32);
    const bytes = fs.readSync(fd, header, 0, 32, 0);
    fs.closeSync(fd);
    if (bytes >= 24 && header[0] === 0x89 && header.toString('ascii', 1, 4) === 'PNG') {
      return { width: header.readUInt32BE(16), height: header.readUInt32BE(20), format: 'png' };
    }
    if (bytes >= 4 && header[0] === 0xff && header[1] === 0xd8) {
      // Scan JPEG segments for a Start Of Frame marker.
      const data = fs.readFileSync(filePath);
      let offset = 2;
      while (offset + 9 < data.length) {
        if (data[offset] !== 0xff) { offset += 1; continue; }
        const marker = data[offset + 1];
        if (marker >= 0xc0 && marker <= 0xc3) {
          return { width: data.readUInt16BE(offset + 7), height: data.readUInt16BE(offset + 5), format: 'jpeg' };
        }
        const length = data.readUInt16BE(offset + 2);
        offset += 2 + length;
      }
    }
  } catch {}
  return null;
}

export async function readPdfInfo(pdfPath) {
  const pdfinfo = resolvePdfinfoBinary();
  if (!pdfinfo) return { pageCount: null, pageWidthPt: null, pageHeightPt: null };
  try {
    const { stdout } = await runProcess(pdfinfo, [pdfPath], { timeoutMs: 60_000 });
    const pages = stdout.match(/Pages:\s+(\d+)/i);
    const size = stdout.match(/Page size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/i);
    return {
      pageCount: pages ? parseInt(pages[1], 10) : null,
      pageWidthPt: size ? parseFloat(size[1]) : null,
      pageHeightPt: size ? parseFloat(size[2]) : null
    };
  } catch {
    return { pageCount: null, pageWidthPt: null, pageHeightPt: null };
  }
}

export async function readPdfPageCount(pdfPath) {
  return (await readPdfInfo(pdfPath)).pageCount;
}
