import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import yauzl from 'yauzl';
import { presentationDir, resolveStorageKey, storageKeyFor, fileHash } from './storage.js';

const MAX_ARCHIVE_FILES = 800;
const MAX_ARCHIVE_UNCOMPRESSED = 6 * 1024 * 1024 * 1024;
const MAX_PPTX_SIZE = 500 * 1024 * 1024;

const STOP_WORDS = new Set([
  'milven', 'cfa', 'level', 'l1', 'l2', 'l3', '2025', '2026', '2027', '2028',
  'module', 'modules', 'lm', 'all', 'whole', 'volume', 'review', 'exam', 'revision',
  'enhanced', 'final', 'rigorous', 'master', 'masterclass', 'revised', 'updated',
  'and', 'the', 'of', 'for', 'to', 'in', 'on', 'with', 'v8', 'v9'
]);

export function normalizeWords(value) {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function titleTokens(value) {
  return new Set(normalizeWords(value).filter(w => w.length > 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w)));
}

function containmentScore(a, b) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / Math.min(a.size, b.size);
}

function detectLevel(text) {
  const upper = String(text || '').toUpperCase();
  if (/CFA[_\s-]*(?:LEVEL[_\s-]*)?1\b|\bL1\b|LEVEL[_\s-]*I(?![IV])/.test(upper)) return 'LEVEL1';
  if (/CFA[_\s-]*(?:LEVEL[_\s-]*)?2\b|\bL2\b|LEVEL[_\s-]*II(?![I])/.test(upper)) return 'LEVEL2';
  if (/CFA[_\s-]*(?:LEVEL[_\s-]*)?3\b|\bL3\b|LEVEL[_\s-]*III/.test(upper)) return 'LEVEL3';
  return null;
}

function detectYear(text) {
  const match = String(text || '').match(/\b(20\d{2})\b/);
  return match ? parseInt(match[1], 10) : null;
}

function isWholeVolumeFile(name) {
  return /(whole[_\s-]*(volume|review)|all[_\s-]*(?:\d+[_\s-]*)?modules|exam[_\s-]*revision)/i.test(name);
}

function moduleNumberFromName(name) {
  const match = String(name || '').match(/(?:module|lm)[_\s-]*(\d{1,3})/i);
  return match ? parseInt(match[1], 10) : null;
}

function titleFromFilename(name) {
  let base = String(name || '').replace(/\.pptx$/i, '');
  base = base.replace(/^milven[_\s-]*/i, '');
  base = base.replace(/cfa[_\s-]*l\d[_\s-]*\d{4}[_\s-]*/i, '');
  const moduleIndex = base.search(/(module|lm)[_\s-]*\d+/i);
  if (moduleIndex >= 0) {
    base = base.slice(moduleIndex).replace(/^(module|lm)[_\s-]*\d+[_\s-]*/i, '');
  }
  return base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function safeEntryName(name) {
  const normalized = String(name || '').replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0')) return false;
  const parts = normalized.split('/');
  if (parts.some(part => part === '..')) return false;
  return true;
}

function openZip(filePath) {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: true }, (err, zip) => {
      if (err) reject(err);
      else resolve(zip);
    });
  });
}

export async function analyzeZip(filePath, { courseId, volumeId, year } = {}, prisma) {
  const zip = await openZip(filePath);
  const entries = [];
  let totalUncompressed = 0;

  await new Promise((resolve, reject) => {
    zip.on('error', reject);
    zip.on('end', resolve);
    zip.on('entry', (entry) => {
      const name = entry.fileName;
      if (entry.fileName.endsWith('/')) return zip.readEntry();
      if (!safeEntryName(name)) return reject(new Error(`Unsafe path in ZIP archive: ${name}`));
      if (entries.length >= MAX_ARCHIVE_FILES) {
        return reject(new Error(`ZIP archive contains more than ${MAX_ARCHIVE_FILES} files.`));
      }
      totalUncompressed += entry.uncompressedSize || 0;
      if (totalUncompressed > MAX_ARCHIVE_UNCOMPRESSED) {
        return reject(new Error('ZIP archive expands beyond the allowed size limit.'));
      }
      const isPptx = /\.pptx$/i.test(name) && !/^__MACOSX\//i.test(name) && !/(^|\/)~\$/i.test(name);
      if (!isPptx) return zip.readEntry();
      if ((entry.uncompressedSize || 0) > MAX_PPTX_SIZE) {
        entries.push({
          zipPath: name,
          fileName: path.posix.basename(name),
          size: entry.uncompressedSize || 0,
          error: 'File exceeds the 500 MB PowerPoint limit'
        });
        return zip.readEntry();
      }
      entries.push({
        zipPath: name,
        fileName: path.posix.basename(name),
        size: entry.uncompressedSize || 0,
        folder: path.posix.basename(path.posix.dirname(name))
      });
      zip.readEntry();
    });
    zip.readEntry();
  });

  const courses = await prisma.course.findMany({
    where: courseId ? { id: courseId } : {},
    select: { id: true, name: true, level: true }
  });
  const fixedCourse = courseId ? courses.find(c => c.id === courseId) : null;

  const allCourseIds = fixedCourse ? [fixedCourse.id] : courses.map(c => c.id);
  const volumeLinks = await prisma.courseVolume.findMany({
    where: { courseId: { in: allCourseIds }, ...(volumeId ? { volumeId } : {}) },
    include: {
      volume: { select: { id: true, name: true } },
      course: { select: { id: true, name: true, level: true } }
    }
  });

  const volumeIds = [...new Set(volumeLinks.map(l => l.volumeId))];
  const modules = volumeIds.length
    ? await prisma.module.findMany({
        where: { volumeId: { in: volumeIds }, courseId: { in: allCourseIds } },
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, courseId: true, volumeId: true, order: true }
      })
    : [];

  const seen = new Map();
  const results = entries.map((entry, index) => {
    if (entry.error) {
      return { ...entry, index, matchType: 'NONE', confidence: 0, error: entry.error };
    }
    const detectedLevel = detectLevel(entry.zipPath);
    const detectedYear = detectYear(entry.zipPath) || Number(year) || 2027;
    const wholeVolume = isWholeVolumeFile(entry.fileName);
    const moduleNumber = wholeVolume ? null : moduleNumberFromName(entry.fileName);

    let course = fixedCourse;
    if (!course) {
      const candidates = courses.filter(c => !detectedLevel || c.level === detectedLevel);
      course = candidates.find(c => /cfa/i.test(c.name)) || candidates[0] || null;
    }

    const linkedForCourse = volumeLinks.filter(l => !course || l.courseId === course.id);
    const folderTokens = titleTokens(entry.folder);
    const fileTokens = titleTokens(entry.fileName);
    const distinct = (links) => [...new Map(links.map(l => [l.volumeId, l])).values()];

    const folderMatches = distinct(linkedForCourse.filter((link) => {
      const vt = titleTokens(link.volume.name);
      return containmentScore(folderTokens, vt) >= 0.75
        || normalizeWords(link.volume.name).join(' ') === normalizeWords(entry.folder).join(' ');
    }));
    const filenameMatches = distinct(linkedForCourse.filter((link) => {
      return containmentScore(fileTokens, titleTokens(link.volume.name)) >= 0.8;
    }));

    let chosenVolume = null;
    if (volumeId) {
      const selected = linkedForCourse.find(l => l.volumeId === volumeId) || null;
      // A recognisable folder that belongs to a different volume must never be
      // silently attached to the selected volume.
      if (folderMatches.length && !folderMatches.some(l => l.volumeId === volumeId)) {
        chosenVolume = null;
      } else {
        chosenVolume = selected;
      }
    } else if (folderMatches.length) {
      chosenVolume = folderMatches.sort((a, b) => modules.filter(m => m.volumeId === b.volumeId).length - modules.filter(m => m.volumeId === a.volumeId).length)[0];
    } else if (filenameMatches.length) {
      chosenVolume = filenameMatches.sort((a, b) => modules.filter(m => m.volumeId === b.volumeId).length - modules.filter(m => m.volumeId === a.volumeId).length)[0];
    } else if (distinct(linkedForCourse).length === 1) {
      chosenVolume = distinct(linkedForCourse)[0];
    }

    let moduleRecord = null;
    let matchType = 'NONE';
    let confidence = 0;
    let detectedTitle = titleFromFilename(entry.fileName);

    if (chosenVolume && course) {
      const volumeModules = modules.filter(m => m.volumeId === chosenVolume.volumeId && m.courseId === course.id);
      if (wholeVolume) {
        moduleRecord = null;
        matchType = volumeModules.length ? 'VOLUME_REVIEW' : 'NONE';
        confidence = volumeModules.length ? 0.95 : 0;
        detectedTitle = `${chosenVolume.volume.name} — Whole Volume Review`;
      } else {
        const fileTokens = titleTokens(detectedTitle);
        let best = null;
        for (const m of volumeModules) {
          const score = containmentScore(fileTokens, titleTokens(m.name));
          if (score >= 0.72 && (!best || score > best.score)) best = { module: m, score };
        }
        if (best) {
          moduleRecord = best.module;
          matchType = 'TITLE';
          confidence = Math.min(0.99, 0.7 + best.score * 0.29);
          detectedTitle = best.module.name;
        } else if (moduleNumber != null) {
          const byNumber = volumeModules.find(m => m.order === moduleNumber);
          if (byNumber) {
            moduleRecord = byNumber;
            matchType = 'NUMBER';
            confidence = 0.8;
            detectedTitle = byNumber.name;
          }
        }
        if (!moduleRecord && fileTokens.size > 0) {
          let bestFuzzy = null;
          for (const m of volumeModules) {
            const score = containmentScore(fileTokens, titleTokens(m.name));
            if (score >= 0.45 && (!bestFuzzy || score > bestFuzzy.score)) bestFuzzy = { module: m, score };
          }
          if (bestFuzzy) {
            moduleRecord = bestFuzzy.module;
            matchType = 'FUZZY';
            confidence = Math.max(0.45, Math.min(0.69, bestFuzzy.score));
            detectedTitle = bestFuzzy.module.name;
          }
        }
      }
    }

    const duplicateKey = `${course?.id || ''}|${chosenVolume?.volumeId || ''}|${wholeVolume ? 'VOLUME' : (moduleRecord?.id || moduleNumber || '')}`;
    const duplicateOf = seen.get(duplicateKey);
    if (!wholeVolume && duplicateKey && duplicateOf) {
      // duplicate, leave as-is but flag
    }
    if (!wholeVolume && duplicateKey) seen.set(duplicateKey, entry.fileName);

    const outcome = {
      index,
      zipPath: entry.zipPath,
      fileName: entry.fileName,
      size: entry.size,
      detectedLevel: detectedLevel || course?.level || null,
      detectedYear,
      detectedVolumeName: chosenVolume?.volume?.name || entry.folder || null,
      detectedModuleNumber: moduleNumber,
      detectedTitle: detectedTitle || entry.fileName,
      isWholeVolume: wholeVolume,
      suggestedCourseId: course?.id || null,
      suggestedVolumeId: chosenVolume?.volumeId || null,
      suggestedModuleId: wholeVolume ? null : (moduleRecord?.id || null),
      matchType,
      confidence: Number(confidence.toFixed(2)),
      duplicate: Boolean(duplicateOf),
      duplicateOf: duplicateOf || null
    };
    return outcome;
  });

  return {
    entries: results,
    detectedFiles: results.length,
    matched: results.filter(r => r.matchType !== 'NONE' && !r.duplicate).length,
    unmatched: results.filter(r => r.matchType === 'NONE').length,
    duplicates: results.filter(r => r.duplicate).length
  };
}

function extractEntryToFile(zipPath, entryName, destination) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zip) => {
      if (err) return reject(err);
      let found = false;
      zip.on('error', reject);
      zip.on('end', () => {
        if (!found) reject(new Error(`ZIP entry not found: ${entryName}`));
      });
      zip.on('entry', (entry) => {
        if (entry.fileName !== entryName || entry.fileName.endsWith('/')) return zip.readEntry();
        if (!safeEntryName(entry.fileName)) return reject(new Error('Unsafe ZIP entry'));
        if ((entry.uncompressedSize || 0) > MAX_PPTX_SIZE) {
          return reject(new Error('PowerPoint file exceeds the 500 MB limit'));
        }
        found = true;
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr) return reject(streamErr);
          const out = fs.createWriteStream(destination);
          let written = 0;
          stream.on('data', (chunk) => {
            written += chunk.length;
            if (written > MAX_PPTX_SIZE) {
              stream.destroy(new Error('PowerPoint file exceeds the 500 MB limit'));
            }
          });
          stream.on('error', reject);
          out.on('error', reject);
          out.on('finish', () => resolve({ bytes: written }));
          stream.pipe(out);
        });
      });
      zip.readEntry();
    });
  });
}

export async function importZipMappings(prisma, {
  batch,
  mappings,
  userId
}) {
  const archivePath = resolveStorageKey(batch.archiveStorageKey);
  if (!fs.existsSync(archivePath)) throw new Error('The original ZIP archive is no longer available.');

  const created = [];
  let skipped = 0;
  const problems = [];

  for (const mapping of mappings) {
    if (!mapping?.include) {
      skipped += 1;
      continue;
    }
    const courseId = mapping.courseId || batch.courseId;
    const volumeId = mapping.volumeId || batch.volumeId;
    const scope = mapping.scope === 'WHOLE_VOLUME' ? 'WHOLE_VOLUME' : 'LEARNING_MODULE';
    const moduleId = scope === 'WHOLE_VOLUME' ? null : (mapping.moduleId || null);

    if (!courseId || !volumeId) {
      problems.push({ file: mapping.fileName, error: 'Course and volume are required.' });
      skipped += 1;
      continue;
    }
    if (scope === 'LEARNING_MODULE' && !moduleId) {
      problems.push({ file: mapping.fileName, error: 'Learning Module is required for module presentations.' });
      skipped += 1;
      continue;
    }

    try {
      const [course, volume, moduleRecord] = await Promise.all([
        prisma.course.findUnique({ where: { id: courseId }, select: { id: true, level: true } }),
        prisma.volume.findUnique({ where: { id: volumeId }, select: { id: true } }),
        moduleId ? prisma.module.findUnique({ where: { id: moduleId }, select: { id: true, courseId: true, volumeId: true } }) : Promise.resolve(null)
      ]);
      if (!course || !volume) throw new Error('Selected course or volume no longer exists.');
      if (scope === 'LEARNING_MODULE' && (!moduleRecord || moduleRecord.courseId !== courseId || moduleRecord.volumeId !== volumeId)) {
        throw new Error('The selected Learning Module does not belong to this course and volume.');
      }

      const id = crypto.randomUUID();
      const dir = presentationDir(id);
      const destination = path.join(dir, 'original.pptx');
      await extractEntryToFile(archivePath, mapping.zipPath, destination);
      const hash = await fileHash(destination);
      const stat = await fs.promises.stat(destination);
      const key = storageKeyFor('presentations', id, 'original.pptx');

      const presentation = await prisma.presentation.create({
        data: {
          id,
          title: String(mapping.title || mapping.detectedTitle || mapping.fileName || 'Presentation').slice(0, 300),
          description: mapping.description ? String(mapping.description).slice(0, 5000) : null,
          courseId,
          volumeId,
          moduleId,
          year: Number(mapping.year || batch.year || 2027),
          scope,
          originalFilename: path.posix.basename(mapping.fileName || destination),
          fileStorageKey: key,
          fileHash: hash,
          fileSize: stat.size,
          status: 'DRAFT',
          processingStatus: 'PENDING',
          tags: Array.isArray(mapping.tags) ? mapping.tags.filter(Boolean).slice(0, 30) : [],
          importBatchId: batch.id,
          createdById: userId || null
        }
      });
      created.push(presentation);
    } catch (err) {
      problems.push({ file: mapping.fileName, error: String(err?.message || err) });
      skipped += 1;
    }
  }

  return { created, skipped, problems };
}

export async function retryFailedBatch(prisma, batchId, enqueue) {
  const failed = await prisma.presentation.findMany({
    where: { importBatchId: batchId, deletedAt: null, processingStatus: 'FAILED' },
    select: { id: true }
  });
  if (!failed.length) return { retried: 0 };
  await prisma.presentation.updateMany({
    where: { id: { in: failed.map(f => f.id) } },
    data: { processingStatus: 'PENDING', processingError: null, processingAttempts: 0 }
  });
  await prisma.presentationBatch.update({
    where: { id: batchId },
    data: { status: 'PROCESSING' }
  }).catch(() => {});
  failed.forEach(f => enqueue(f.id));
  return { retried: failed.length };
}
