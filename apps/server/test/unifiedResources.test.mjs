import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeNoteSource,
  paginateResources,
  resourceCounts,
  sortResources
} from '../src/lib/unifiedResources.js';

const resources = [
  { id: 'a', title: 'Beta', type: 'NOTE', source: 'AI', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'b', title: 'Alpha', type: 'PDF', source: 'UPLOAD', createdAt: '2026-03-01T00:00:00.000Z' },
  { id: 'c', title: 'Gamma', type: 'FORMULA', source: 'MANUAL', createdAt: '2026-02-01T00:00:00.000Z' }
];

test('normalizes stored note source metadata', () => {
  assert.equal(normalizeNoteSource('MANUAL'), 'MANUAL');
  assert.equal(normalizeNoteSource('AI_GENERATED'), 'AI');
  assert.equal(normalizeNoteSource(null), 'AI');
});

test('sorts and paginates the complete merged resource set', () => {
  assert.deepEqual(sortResources(resources, 'newest').map(item => item.id), ['b', 'c', 'a']);
  assert.deepEqual(sortResources(resources, 'oldest').map(item => item.id), ['a', 'c', 'b']);
  assert.deepEqual(sortResources(resources, 'title').map(item => item.title), ['Alpha', 'Beta', 'Gamma']);
  const page = paginateResources(sortResources(resources, 'newest'), { page: 2, limit: 2 });
  assert.equal(page.total, 3);
  assert.equal(page.resources.length, 1);
  assert.equal(page.resources[0].id, 'a');
});

test('counts each source across the complete merged set', () => {
  assert.deepEqual(resourceCounts(resources), { ai: 1, manual: 1, uploadedPdf: 1 });
});
