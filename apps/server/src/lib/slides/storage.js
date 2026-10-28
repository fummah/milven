import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

// Slide assets are deliberately stored OUTSIDE the public /uploads directory.
// Every read goes through an authorization check or a short-lived signed URL.
export function slidesStorageRoot() {
  const configured = process.env.SLIDES_STORAGE_DIR;
  if (configured) return path.resolve(configured);
  return path.resolve(process.cwd(), 'storage', 'milven-slides');
}

export function ensureStorageDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function presentationDir(presentationId) {
  return ensureStorageDir(path.join(slidesStorageRoot(), 'presentations', safeSegment(presentationId)));
}

export function batchDir(batchId) {
  return ensureStorageDir(path.join(slidesStorageRoot(), 'imports', safeSegment(batchId)));
}

export function safeSegment(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120) || 'item';
}

export function sanitizeFilename(name, fallback = 'presentation.pptx') {
  const base = path.basename(String(name || '')).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').trim();
  return base || fallback;
}

export function resolveStorageKey(key) {
  const root = slidesStorageRoot();
  const full = path.resolve(root, String(key || ''));
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error('Invalid storage key');
  }
  return full;
}

export function storageKeyFor(...parts) {
  return parts.map(p => String(p).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')).join('/');
}

export function writeRelativeKey(key, buffer) {
  const full = resolveStorageKey(key);
  ensureStorageDir(path.dirname(full));
  fs.writeFileSync(full, buffer);
  return key;
}

export function fileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export async function moveFile(source, destination) {
  ensureStorageDir(path.dirname(destination));
  try {
    await fs.promises.rename(source, destination);
  } catch (err) {
    if (err?.code !== 'EXDEV') throw err;
    await fs.promises.copyFile(source, destination);
    await fs.promises.unlink(source).catch(() => {});
  }
}

export function removeStorageKey(key) {
  if (!key) return;
  try {
    const full = resolveStorageKey(key);
    fs.rmSync(full, { force: true, recursive: true });
  } catch {}
}

export function removePresentationStorage(presentationId) {
  try {
    fs.rmSync(path.join(slidesStorageRoot(), 'presentations', safeSegment(presentationId)), {
      recursive: true,
      force: true
    });
  } catch {}
}

export function assetToken({ presentationId, kind, slideNumber = null, userId = null, admin = false, ttlSeconds = 7200 }) {
  return jwt.sign(
    {
      aud: 'milven-slide-asset',
      pid: presentationId,
      kind,
      n: slideNumber,
      uid: userId || null,
      adm: Boolean(admin)
    },
    process.env.JWT_SECRET ?? 'dev_secret',
    { expiresIn: ttlSeconds }
  );
}

export function verifyAssetToken(token) {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'dev_secret');
    if (payload?.aud !== 'milven-slide-asset') return null;
    return payload;
  } catch {
    return null;
  }
}

export function signedAssetUrl({ presentationId, kind, slideNumber = null, userId = null, admin = false, version = null }) {
  const token = assetToken({ presentationId, kind, slideNumber, userId, admin });
  const q = new URLSearchParams({ token });
  if (version) q.set('v', String(version));
  const suffix = slideNumber == null ? '' : `/${slideNumber}`;
  return `/api/slides/assets/${encodeURIComponent(presentationId)}/${encodeURIComponent(kind)}${suffix}?${q.toString()}`;
}
