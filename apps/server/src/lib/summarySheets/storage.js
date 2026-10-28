import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

export function summaryStorageRoot() {
  const configured = process.env.SUMMARY_SHEET_STORAGE_DIR;
  if (configured) return path.resolve(configured);
  return path.resolve(process.cwd(), 'storage', 'summary-sheets');
}

export function ensureSummaryDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function safeSegment(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120) || 'item';
}

export function summarySheetDir(id) {
  return ensureSummaryDir(path.join(summaryStorageRoot(), 'sheets', safeSegment(id)));
}

export function safeFilename(name, fallback = 'summary-sheet.pdf') {
  const base = path.basename(String(name || '')).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').trim();
  return base || fallback;
}

export function resolveSummaryKey(key) {
  const root = summaryStorageRoot();
  const full = path.resolve(root, String(key || ''));
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error('Invalid summary sheet storage key');
  return full;
}

export function summaryKey(...parts) {
  return parts.map(part => String(part).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')).join('/');
}

export async function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export async function moveFile(source, destination) {
  ensureSummaryDir(path.dirname(destination));
  try {
    await fs.promises.rename(source, destination);
  } catch (err) {
    if (err?.code !== 'EXDEV') throw err;
    await fs.promises.copyFile(source, destination);
    await fs.promises.unlink(source).catch(() => {});
  }
}

export function removeSummaryKey(key) {
  if (!key) return;
  try { fs.rmSync(resolveSummaryKey(key), { force: true, recursive: true }); } catch {}
}

export function removeSummaryStorage(id) {
  try {
    fs.rmSync(path.join(summaryStorageRoot(), 'sheets', safeSegment(id)), { recursive: true, force: true });
  } catch {}
}

export function summaryPdfToken({ id, userId = null, admin = false, ttlSeconds = 7200 }) {
  return jwt.sign(
    { aud: 'milven-summary-pdf', sid: id, uid: userId || null, adm: Boolean(admin) },
    process.env.JWT_SECRET ?? 'dev_secret',
    { expiresIn: ttlSeconds }
  );
}

export function verifySummaryPdfToken(token) {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'dev_secret');
    if (payload?.aud !== 'milven-summary-pdf') return null;
    return payload;
  } catch {
    return null;
  }
}

export function signedSummaryPdfUrl({ id, userId = null, admin = false, version = null }) {
  const token = summaryPdfToken({ id, userId, admin });
  const query = new URLSearchParams({ token });
  if (version) query.set('v', String(version));
  return `/api/summary-sheets/assets/${encodeURIComponent(id)}/pdf?${query.toString()}`;
}
