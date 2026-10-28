import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractFontFamilies } from '../src/lib/slides/pptx.js';
import { readImageDimensions } from '../src/lib/slides/renderer.js';

test('extracts concrete PPTX font families and ignores theme placeholders', () => {
  const xml = `
    <p:sld>
      <a:rPr><a:latin typeface="Aptos"/><a:cs typeface="Aptos"/></a:rPr>
      <a:rPr><a:latin typeface="Cambria Math"/></a:rPr>
      <a:rPr><a:latin typeface="+mn-lt"/></a:rPr>
      <a:endParaRPr><a:latin typeface=""/></a:endParaRPr>
    </p:sld>`;
  const fonts = extractFontFamilies(xml);
  assert.ok(fonts.has('Aptos'));
  assert.ok(fonts.has('Cambria Math'));
  assert.equal(fonts.size, 2);
});

test('reads dimensions from a PNG preview header', () => {
  const header = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(1920, 16);
  header.writeUInt32BE(1080, 20);
  const file = path.join(os.tmpdir(), `milven-slide-header-${process.pid}.png`);
  fs.writeFileSync(file, header);
  try {
    assert.deepEqual(readImageDimensions(file), { width: 1920, height: 1080, format: 'png' });
  } finally {
    fs.rmSync(file, { force: true });
  }
});
