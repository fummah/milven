export const RESOURCE_SOURCES = Object.freeze({
  AI: 'AI',
  MANUAL: 'MANUAL',
  UPLOAD: 'UPLOAD'
});

export function normalizeNoteSource(sourceType) {
  return String(sourceType || '').toUpperCase() === 'MANUAL' ? RESOURCE_SOURCES.MANUAL : RESOURCE_SOURCES.AI;
}

export function sortResources(resources, sort = 'newest') {
  const items = [...resources];
  const time = value => new Date(value || 0).getTime();
  if (sort === 'oldest') return items.sort((a, b) => time(a.createdAt) - time(b.createdAt));
  if (sort === 'title') return items.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
  if (sort === 'type') return items.sort((a, b) => String(a.type || '').localeCompare(String(b.type || '')) || time(b.createdAt) - time(a.createdAt));
  return items.sort((a, b) => time(b.createdAt) - time(a.createdAt));
}

export function paginateResources(resources, { page = 1, limit = 24 } = {}) {
  const pageNum = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(limit) || 24));
  const start = (pageNum - 1) * pageSize;
  return {
    resources: resources.slice(start, start + pageSize),
    total: resources.length,
    page: pageNum,
    limit: pageSize
  };
}

export function resourceCounts(resources) {
  return resources.reduce((counts, item) => {
    const key = item.source === RESOURCE_SOURCES.UPLOAD ? 'uploadedPdf' : item.source === RESOURCE_SOURCES.MANUAL ? 'manual' : 'ai';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, { ai: 0, manual: 0, uploadedPdf: 0 });
}
