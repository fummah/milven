import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

export function formulaBookStorageRoot() {
  const configured = process.env.FORMULA_BOOK_STORAGE_DIR;
  if (configured) return path.resolve(configured);
  return path.resolve(process.cwd(), 'storage', 'formula-books');
}

export function ensureFormulaBookDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function safeSegment(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120) || 'item';
}

export function formulaBookDir(id) {
  return ensureFormulaBookDir(path.join(formulaBookStorageRoot(), 'books', safeSegment(id)));
}

export function safeFilename(name, fallback = 'formula-book.pdf') {
  const base = path.basename(String(name || '')).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').trim();
  return base || fallback;
}

export function resolveFormulaBookKey(key) {
  const root = formulaBookStorageRoot();
  const full = path.resolve(root, String(key || ''));
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error('Invalid formula book storage key');
  return full;
}

export function formulaBookKey(...parts) {
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
  ensureFormulaBookDir(path.dirname(destination));
  try {
    await fs.promises.rename(source, destination);
  } catch (err) {
    if (err?.code !== 'EXDEV') throw err;
    await fs.promises.copyFile(source, destination);
    await fs.promises.unlink(source).catch(() => {});
  }
}

export function removeFormulaBookKey(key) {
  if (!key) return;
  try { fs.rmSync(resolveFormulaBookKey(key), { force: true, recursive: true }); } catch {}
}

export function removeFormulaBookStorage(id) {
  try {
    fs.rmSync(path.join(formulaBookStorageRoot(), 'books', safeSegment(id)), { recursive: true, force: true });
  } catch {}
}

export function formulaBookPdfToken({ id, userId = null, admin = false, ttlSeconds = 7200 }) {
  return jwt.sign(
    { aud: 'milven-formula-book-pdf', sid: id, uid: userId || null, adm: Boolean(admin) },
    process.env.JWT_SECRET ?? 'dev_secret',
    { expiresIn: ttlSeconds }
  );
}

export function verifyFormulaBookPdfToken(token) {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'dev_secret');
    if (payload?.aud !== 'milven-formula-book-pdf') return null;
    return payload;
  } catch {
    return null;
  }
}

export function signedFormulaBookPdfUrl({ id, userId = null, admin = false, version = null }) {
  const token = formulaBookPdfToken({ id, userId, admin });
  const query = new URLSearchParams({ token });
  if (version) query.set('v', String(version));
  return `/api/formula-books/assets/${encodeURIComponent(id)}/pdf?${query.toString()}`;
}

export function formulaBookThumbnailKey(id, version) {
  return formulaBookKey('books', safeSegment(id), 'versions', safeSegment(version || 'v1'), 'thumbnail.png');
}

export function resolveFormulaBookThumbnailKey(key) {
  return resolveFormulaBookKey(key);
}

export function signedFormulaBookThumbnailUrl({ id, userId = null, admin = false, version = null }) {
  const token = formulaBookPdfToken({ id, userId, admin });
  const query = new URLSearchParams({ token });
  if (version) query.set('v', String(version));
  return `/api/formula-books/assets/${encodeURIComponent(id)}/thumbnail?${query.toString()}`;
}
