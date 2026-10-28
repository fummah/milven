import test from 'node:test';
import assert from 'node:assert/strict';
import { looksLikePdfBuffer, normalizePdfSearchText } from '../src/lib/summarySheets/pdf.js';
import { summaryPdfToken, verifySummaryPdfToken, signedSummaryPdfUrl } from '../src/lib/summarySheets/storage.js';

test('PDF signature validation rejects non-PDF buffers', () => {
  assert.equal(looksLikePdfBuffer(Buffer.from('%PDF-1.7\n')), true);
  assert.equal(looksLikePdfBuffer(Buffer.from('<html>not a pdf</html>')), false);
});

test('PDF search normalization preserves words and removes soft hyphenation', () => {
  assert.equal(normalizePdfSearchText('Weighted  aver-\nage\tcost'), 'Weighted average cost');
});

test('summary PDF signed tokens are scoped to a sheet and role', () => {
  const token = summaryPdfToken({ id: 'sheet-1', userId: 'u1', admin: true });
  const payload = verifySummaryPdfToken(token);
  assert.equal(payload.sid, 'sheet-1');
  assert.equal(payload.adm, true);
  assert.match(signedSummaryPdfUrl({ id: 'sheet-1', userId: 'u1' }), /\/api\/summary-sheets\/assets\/sheet-1\/pdf\?token=/);
});
