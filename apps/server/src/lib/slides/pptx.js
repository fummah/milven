import yauzl from 'yauzl';
import fs from 'node:fs';
import path from 'node:path';

const MAX_XML_BYTES = 24 * 1024 * 1024;
const PPTX_MAIN_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml';

function readZipEntries(filePath, predicate) {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: false }, (err, zip) => {
      if (err) return reject(err);
      const entries = new Map();
      let settled = false;

      const finish = (error) => {
        if (settled) return;
        settled = true;
        try { zip.close(); } catch {}
        if (error) reject(error);
        else resolve(entries);
      };

      zip.on('error', finish);
      zip.on('end', () => finish());

      zip.on('entry', (entry) => {
        const name = entry.fileName;
        const wanted = !entry.fileName.endsWith('/') && predicate(name, entry);
        if (!wanted) {
          zip.readEntry();
          return;
        }
        if (entry.uncompressedSize > MAX_XML_BYTES) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr) return finish(streamErr);
          const chunks = [];
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('error', finish);
          stream.on('end', () => {
            entries.set(name, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });

      zip.readEntry();
    });
  });
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return ''; }
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      try { return String.fromCodePoint(parseInt(dec, 10)); } catch { return ''; }
    })
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function extractTextFromSlideXml(xml) {
  if (!xml) return '';
  const withParagraphs = String(xml).replace(/<\/a:p>/gi, '</a:p>\n');
  const matches = [...withParagraphs.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi)];
  const text = matches.map(m => decodeXml(m[1])).join(' ').replace(/\s+\n/g, '\n');
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function attr(tag, name) {
  const re = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i');
  const m = String(tag).match(re);
  return m ? m[1] : null;
}

function parseRelationships(xml) {
  const map = new Map();
  if (!xml) return map;
  const re = /<Relationship\b[^>]*\/?>/gi;
  for (const match of String(xml).matchAll(re)) {
    const tag = match[0];
    const id = attr(tag, 'Id');
    const target = attr(tag, 'Target');
    const type = attr(tag, 'Type');
    if (id && target) map.set(id, { target, type });
  }
  return map;
}

function resolveTarget(baseDir, target) {
  if (!target) return null;
  const clean = target.replace(/\\/g, '/');
  if (clean.startsWith('/')) return path.posix.normalize(clean.replace(/^\/+/, ''));
  return path.posix.normalize(path.posix.join(baseDir, clean));
}

function relsPathFor(partPath) {
  const dir = path.posix.dirname(partPath);
  const name = path.posix.basename(partPath);
  return path.posix.join(dir, '_rels', `${name}.rels`);
}

function readCoreMetadata(xml) {
  const result = { title: '', keywords: '' };
  if (!xml) return result;
  const titleMatch = String(xml).match(/<dc:title>([\s\S]*?)<\/dc:title>/i);
  const keywordsMatch = String(xml).match(/<cp:keywords>([\s\S]*?)<\/cp:keywords>/i);
  if (titleMatch) result.title = decodeXml(titleMatch[1]).trim();
  if (keywordsMatch) result.keywords = decodeXml(keywordsMatch[1]).trim();
  return result;
}

function pageNumberFromPath(p) {
  const m = String(p).match(/(\d+)\.xml$/i);
  return m ? parseInt(m[1], 10) : null;
}

export async function inspectPptx(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw Object.assign(new Error('PowerPoint file not found'), { code: 'PPTX_NOT_FOUND' });
  }
  const stat = await fs.promises.stat(filePath);
  if (!stat.size) throw Object.assign(new Error('PowerPoint file is empty'), { code: 'PPTX_EMPTY' });

  const entries = await readZipEntries(filePath, (name) => {
    return (
      name === '[Content_Types].xml' ||
      name === 'docProps/core.xml' ||
      name === 'ppt/presentation.xml' ||
      name === 'ppt/_rels/presentation.xml.rels' ||
      /^ppt\/slides\/slide\d+\.xml$/i.test(name) ||
      /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/i.test(name) ||
      /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(name)
    );
  });

  const contentTypes = entries.get('[Content_Types].xml')?.toString('utf8') || '';
  const presentationXml = entries.get('ppt/presentation.xml')?.toString('utf8') || '';

  if (!presentationXml || (!contentTypes.includes(PPTX_MAIN_CONTENT_TYPE) && !contentTypes.includes('presentationml'))) {
    throw Object.assign(new Error('Invalid or unsupported PowerPoint file. Upload a .pptx presentation.'), {
      code: 'PPTX_INVALID'
    });
  }

  const presentationRels = parseRelationships(entries.get('ppt/_rels/presentation.xml.rels')?.toString('utf8'));
  const orderedSlidePaths = [];
  const sldIdRe = /<p:sldId\b[^>]*\/?>/gi;
  for (const match of presentationXml.matchAll(sldIdRe)) {
    const rid = attr(match[0], 'r:id');
    const rel = rid ? presentationRels.get(rid) : null;
    const resolved = rel?.target ? resolveTarget('ppt', rel.target) : null;
    if (resolved && entries.has(resolved)) orderedSlidePaths.push(resolved);
  }

  if (orderedSlidePaths.length === 0) {
    const discovered = [...entries.keys()]
      .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => (pageNumberFromPath(a) || 0) - (pageNumberFromPath(b) || 0));
    orderedSlidePaths.push(...discovered);
  }

  if (orderedSlidePaths.length === 0) {
    throw Object.assign(new Error('The PowerPoint file does not contain any slides.'), {
      code: 'PPTX_NO_SLIDES'
    });
  }

  const slides = orderedSlidePaths.map((slidePath, index) => {
    const slideXml = entries.get(slidePath)?.toString('utf8') || '';
    let notes = '';
    const rels = parseRelationships(entries.get(relsPathFor(slidePath))?.toString('utf8'));
    for (const rel of rels.values()) {
      if (!rel.type || !/notesSlide$/i.test(rel.type)) continue;
      const notesPath = resolveTarget(path.posix.dirname(slidePath), rel.target);
      if (notesPath && entries.has(notesPath)) {
        notes = extractTextFromSlideXml(entries.get(notesPath)?.toString('utf8'));
        break;
      }
    }
    return {
      slideNumber: index + 1,
      text: extractTextFromSlideXml(slideXml),
      notes
    };
  });

  const core = readCoreMetadata(entries.get('docProps/core.xml')?.toString('utf8'));

  return {
    slides,
    slideCount: slides.length,
    coreTitle: core.title,
    coreKeywords: core.keywords
  };
}

export function looksLikePptx(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    return buf[0] === 0x50 && buf[1] === 0x4b;
  } catch {
    return false;
  }
}
