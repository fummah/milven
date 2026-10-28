import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

export function looksLikePdfBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

export function normalizePdfSearchText(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/\u00ad/g, '')
    .replace(/-\s*\n\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function textFromContent(content) {
  let text = '';
  let lastY = null;
  for (const item of content.items || []) {
    const y = item.transform?.[5];
    if (lastY !== null && Number.isFinite(y) && Math.abs(lastY - y) > 2) text += '\n';
    text += item.str || '';
    if (item.hasEOL) text += '\n';
    else text += ' ';
    lastY = y;
  }
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function extractPdfPages(buffer) {
  if (!looksLikePdfBuffer(buffer)) {
    throw Object.assign(new Error('Invalid PDF file signature.'), { code: 'PDF_INVALID' });
  }

  const pages = [];
  let metadata = {};
  try {
    metadata = await pdfParse(buffer, {
      max: 0,
      pagerender: async (pageData) => {
        const content = await pageData.getTextContent({
          normalizeWhitespace: true,
          disableCombineTextItems: false
        });
        const text = textFromContent(content);
        pages.push({ pageNumber: pages.length + 1, text });
        return text;
      }
    });
  } catch (err) {
    const message = String(err?.message || err);
    if (/password|encrypt/i.test(message)) {
      throw Object.assign(new Error('This PDF is password-protected or encrypted. Upload an unlocked PDF.'), {
        code: 'PDF_ENCRYPTED'
      });
    }
    throw Object.assign(new Error(`Could not read this PDF: ${message}`), { code: 'PDF_PARSE_FAILED' });
  }

  const pageCount = Math.max(Number(metadata?.numpages) || 0, pages.length);
  while (pages.length < pageCount) pages.push({ pageNumber: pages.length + 1, text: '' });
  const textLength = pages.reduce((sum, page) => sum + (page.text?.length || 0), 0);
  const scanned = pageCount > 0 && textLength < Math.max(80, pageCount * 12);

  return {
    pages: pages.slice(0, pageCount).map((page, index) => ({
      pageNumber: index + 1,
      text: page.text || '',
      normalizedText: normalizePdfSearchText(page.text)
    })),
    pageCount,
    textLength,
    scanned,
    warning: scanned
      ? 'Text extraction unavailable - document may be scanned. Viewing is available but full-text search may be limited.'
      : null,
    info: {
      title: metadata?.info?.Title || null,
      author: metadata?.info?.Author || null
    }
  };
}
