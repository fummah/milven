import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

export function moduleNotePdfStorageRoot() {
  const configured = process.env.MODULE_NOTE_PDF_STORAGE_DIR;
  if (configured) return path.resolve(configured);
  return path.resolve(process.cwd(), 'storage', 'module-note-pdfs');
}

export function ensureModuleNotePdfDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function safeSegment(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120) || 'item';
}

export function moduleNotePdfDir(id) {
  return ensureModuleNotePdfDir(path.join(moduleNotePdfStorageRoot(), 'books', safeSegment(id)));
}

export function safeFilename(name, fallback = 'module-notes.pdf') {
  const base = path.basename(String(name || '')).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').trim();
  return base || fallback;
}

export function resolveModuleNotePdfKey(key) {
  const root = moduleNotePdfStorageRoot();
  const full = path.resolve(root, String(key || ''));
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error('Invalid module notes storage key');
  return full;
}

export function moduleNotePdfKey(...parts) {
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
  ensureModuleNotePdfDir(path.dirname(destination));
  try {
    await fs.promises.rename(source, destination);
  } catch (err) {
    if (err?.code !== 'EXDEV') throw err;
    await fs.promises.copyFile(source, destination);
    await fs.promises.unlink(source).catch(() => {});
  }
}

export function removeModuleNotePdfKey(key) {
  if (!key) return;
  try { fs.rmSync(resolveModuleNotePdfKey(key), { force: true, recursive: true }); } catch {}
}

export function removeModuleNotePdfStorage(id) {
  try {
    fs.rmSync(path.join(moduleNotePdfStorageRoot(), 'books', safeSegment(id)), { recursive: true, force: true });
  } catch {}
}

export function moduleNotePdfToken({ id, userId = null, admin = false, ttlSeconds = 7200 }) {
  return jwt.sign(
    { aud: 'milven-module-note-pdf', sid: id, uid: userId || null, adm: Boolean(admin) },
    process.env.JWT_SECRET ?? 'dev_secret',
    { expiresIn: ttlSeconds }
  );
}

export function verifyModuleNotePdfToken(token) {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'dev_secret');
    if (payload?.aud !== 'milven-module-note-pdf') return null;
    return payload;
  } catch {
    return null;
  }
}

export function signedModuleNotePdfUrl({ id, userId = null, admin = false, version = null }) {
  const token = moduleNotePdfToken({ id, userId, admin });
  const query = new URLSearchParams({ token });
  if (version) query.set('v', String(version));
  return `/api/module-note-pdfs/assets/${encodeURIComponent(id)}/pdf?${query.toString()}`;
}

export function moduleNotePdfThumbnailKey(id, version) {
  return moduleNotePdfKey('books', safeSegment(id), 'versions', safeSegment(version || 'v1'), 'thumbnail.png');
}

export function resolveModuleNotePdfThumbnailKey(key) {
  return resolveModuleNotePdfKey(key);
}

export function signedModuleNotePdfThumbnailUrl({ id, userId = null, admin = false, version = null }) {
  const token = moduleNotePdfToken({ id, userId, admin });
  const query = new URLSearchParams({ token });
  if (version) query.set('v', String(version));
  return `/api/module-note-pdfs/assets/${encodeURIComponent(id)}/thumbnail?${query.toString()}`;
}
