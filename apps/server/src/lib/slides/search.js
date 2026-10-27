import { Prisma } from '@prisma/client';
import { signedAssetUrl } from './storage.js';

export function normalizeSearchTerm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

export function makeExcerpt(text, term, maxLength = 280) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const lower = clean.toLowerCase();
  const needle = String(term || '').toLowerCase().trim();
  if (!needle) return clean.slice(0, maxLength) + (clean.length > maxLength ? '…' : '');
  const index = lower.indexOf(needle);
  if (index < 0) return clean.slice(0, maxLength) + (clean.length > maxLength ? '…' : '');
  const start = Math.max(0, index - Math.floor(maxLength / 3));
  const end = Math.min(clean.length, start + maxLength);
  return `${start > 0 ? '…' : ''}${clean.slice(start, end)}${end < clean.length ? '…' : ''}`;
}

export async function allowedCourseIds(prisma, user) {
  if (!user || user.role === 'ADMIN') return null;
  const rows = await prisma.enrollment.findMany({
    where: { userId: user.id },
    select: { courseId: true }
  });
  return rows.map(r => r.courseId);
}

function presentationSelect() {
  return {
    id: true,
    title: true,
    description: true,
    courseId: true,
    volumeId: true,
    moduleId: true,
    scope: true,
    year: true,
    status: true,
    processingStatus: true,
    slideCount: true,
    thumbnailKey: true,
    tags: true,
    createdAt: true,
    updatedAt: true,
    course: { select: { id: true, name: true, level: true } },
    volume: { select: { id: true, name: true } },
    module: { select: { id: true, name: true } },
    topicLinks: { select: { topic: { select: { id: true, name: true } } } },
    conceptLinks: { select: { concept: { select: { id: true, name: true } } } }
  };
}

export function serializePresentation(presentation, userId, admin = false) {
  if (!presentation) return null;
  return {
    ...presentation,
    topics: (presentation.topicLinks || []).map(t => t.topic).filter(Boolean),
    concepts: (presentation.conceptLinks || []).map(c => c.concept).filter(Boolean),
    topicLinks: undefined,
    conceptLinks: undefined,
    thumbnailUrl: presentation.thumbnailKey && presentation.slideCount
      ? signedAssetUrl({
          presentationId: presentation.id,
          kind: 'thumbnail',
          slideNumber: 1,
          userId,
          admin
        })
      : null
  };
}

function accessFilter({ user, allowedCourseIds: ids, courseId, volumeId, moduleId, status, includeDrafts }) {
  const conditions = [Prisma.sql`p."deletedAt" IS NULL`];
  if (!includeDrafts) conditions.push(Prisma.sql`p."status" = 'PUBLISHED'::"PresentationStatus"`);
  if (status && includeDrafts) conditions.push(Prisma.sql`p."status" = ${status}::"PresentationStatus"`);
  if (courseId) conditions.push(Prisma.sql`p."courseId" = ${courseId}`);
  if (volumeId) conditions.push(Prisma.sql`p."volumeId" = ${volumeId}`);
  if (moduleId) conditions.push(Prisma.sql`p."moduleId" = ${moduleId}`);
  if (ids) {
    if (!ids.length) return null;
    conditions.push(Prisma.sql`p."courseId" IN (${Prisma.join(ids)})`);
  }
  return Prisma.sql`${Prisma.join(conditions, ' AND ')}`;
}

export async function searchSlideText(prisma, {
  q,
  user,
  courseId,
  volumeId,
  moduleId,
  topicId,
  conceptId,
  year,
  status,
  includeDrafts = false,
  limit = 24,
  offset = 0
}) {
  const term = normalizeSearchTerm(q);
  if (term.length < 2) return { results: [], total: 0 };
  const ids = await allowedCourseIds(prisma, user);
  const access = accessFilter({ user, allowedCourseIds: ids, courseId, volumeId, moduleId, status, includeDrafts });
  if (!access) return { results: [], total: 0 };

  const filters = [access];
  if (topicId) {
    filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "PresentationTopic" pt WHERE pt."presentationId" = p.id AND pt."topicId" = ${topicId})`);
  }
  if (conceptId) {
    filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "PresentationConcept" pc WHERE pc."presentationId" = p.id AND pc."conceptId" = ${conceptId})`);
  }
  if (year) filters.push(Prisma.sql`p."year" = ${Number(year)}`);
  const where = Prisma.sql`${Prisma.join(filters, ' AND ')}`;
  const like = `%${term}%`;

  const rows = await prisma.$queryRaw`
    SELECT
      s."id" AS "slideId",
      s."presentationId" AS "presentationId",
      s."slideNumber" AS "slideNumber",
      s."text" AS "text",
      ts_rank_cd(
        to_tsvector('english', coalesce(s."text", '') || ' ' || coalesce(s."notes", '')),
        websearch_to_tsquery('english', ${term})
      ) AS "rank"
    FROM "PresentationSlide" s
    JOIN "Presentation" p ON p."id" = s."presentationId"
    WHERE ${where}
      AND (
        to_tsvector('english', coalesce(s."text", '') || ' ' || coalesce(s."notes", '')) @@ websearch_to_tsquery('english', ${term})
        OR s."text" ILIKE ${like}
        OR s."notes" ILIKE ${like}
      )
    ORDER BY "rank" DESC, s."slideNumber" ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countRows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS "count"
    FROM "PresentationSlide" s
    JOIN "Presentation" p ON p."id" = s."presentationId"
    WHERE ${where}
      AND (
        to_tsvector('english', coalesce(s."text", '') || ' ' || coalesce(s."notes", '')) @@ websearch_to_tsquery('english', ${term})
        OR s."text" ILIKE ${like}
        OR s."notes" ILIKE ${like}
      )
  `;

  const presentationIds = [...new Set(rows.map(r => r.presentationId))];
  const presentations = presentationIds.length
    ? await prisma.presentation.findMany({ where: { id: { in: presentationIds } }, select: presentationSelect() })
    : [];
  const byId = new Map(presentations.map(p => [p.id, p]));

  return {
    results: rows.map((row) => {
      const presentation = byId.get(row.presentationId);
      return {
        slideId: row.slideId,
        presentationId: row.presentationId,
        slideNumber: row.slideNumber,
        excerpt: makeExcerpt(row.text, term),
        matchType: 'SLIDE_TEXT',
        thumbnailUrl: signedAssetUrl({
          presentationId: row.presentationId,
          kind: 'thumbnail',
          slideNumber: row.slideNumber,
          userId: user?.id || null,
          admin: user?.role === 'ADMIN'
        }),
        presentation: serializePresentation(presentation, user?.id || null, user?.role === 'ADMIN')
      };
    }),
    total: countRows?.[0]?.count || 0
  };
}

export async function searchPresentationMetadata(prisma, {
  q,
  user,
  courseId,
  volumeId,
  moduleId,
  topicId,
  conceptId,
  year,
  status,
  includeDrafts = false,
  limit = 12
}) {
  const term = normalizeSearchTerm(q);
  if (term.length < 2) return [];
  const ids = await allowedCourseIds(prisma, user);
  if (ids && !ids.length) return [];

  const where = {
    deletedAt: null,
    ...(includeDrafts ? {} : { status: 'PUBLISHED' }),
    ...(includeDrafts && status ? { status } : {}),
    ...(courseId ? { courseId } : {}),
    ...(volumeId ? { volumeId } : {}),
    ...(moduleId ? { moduleId } : {}),
    ...(year ? { year: Number(year) } : {}),
    ...(ids ? { courseId: { in: ids } } : {}),
    ...(topicId ? { topicLinks: { some: { topicId } } } : {}),
    ...(conceptId ? { conceptLinks: { some: { conceptId } } } : {}),
    OR: [
      { title: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } },
      { tags: { has: term } },
      { module: { name: { contains: term, mode: 'insensitive' } } },
      { volume: { name: { contains: term, mode: 'insensitive' } } },
      { topicLinks: { some: { topic: { name: { contains: term, mode: 'insensitive' } } } } },
      { conceptLinks: { some: { concept: { name: { contains: term, mode: 'insensitive' } } } } }
    ]
  };

  return prisma.presentation.findMany({
    where,
    select: presentationSelect(),
    orderBy: { updatedAt: 'desc' },
    take: limit
  });
}

export async function combinedSearch(prisma, options) {
  const metadataEnabled = !options.offset;
  const [slideResults, metadata] = await Promise.all([
    searchSlideText(prisma, options),
    metadataEnabled ? searchPresentationMetadata(prisma, options) : Promise.resolve([])
  ]);

  const results = [];
  const seenPids = new Set();
  for (const p of metadata) {
    seenPids.add(p.id);
    results.push({
      slideId: null,
      presentationId: p.id,
      slideNumber: 1,
      excerpt: [p.title, p.module?.name, p.volume?.name].filter(Boolean).join(' · '),
      matchType: 'PRESENTATION',
      thumbnailUrl: signedAssetUrl({
        presentationId: p.id,
        kind: 'thumbnail',
        slideNumber: 1,
        userId: options.user?.id || null,
        admin: options.user?.role === 'ADMIN'
      }),
      presentation: serializePresentation(p, options.user?.id || null, options.user?.role === 'ADMIN')
    });
  }
  for (const r of slideResults.results) {
    if (results.some(existing => existing.presentationId === r.presentationId && existing.slideNumber === r.slideNumber)) continue;
    results.push(r);
  }
  return {
    results: results.slice(0, Math.max(options.limit || 24, 24)),
    total: slideResults.total + (metadataEnabled ? metadata.length : 0)
  };
}

export async function searchWithinPresentation(prisma, presentationId, q, limit = 50) {
  const term = normalizeSearchTerm(q);
  if (term.length < 2) return [];
  const like = `%${term}%`;
  const rows = await prisma.$queryRaw`
    SELECT
      s."slideNumber" AS "slideNumber",
      s."text" AS "text",
      ts_rank_cd(
        to_tsvector('english', coalesce(s."text", '') || ' ' || coalesce(s."notes", '')),
        websearch_to_tsquery('english', ${term})
      ) AS "rank"
    FROM "PresentationSlide" s
    WHERE s."presentationId" = ${presentationId}
      AND (
        to_tsvector('english', coalesce(s."text", '') || ' ' || coalesce(s."notes", '')) @@ websearch_to_tsquery('english', ${term})
        OR s."text" ILIKE ${like}
        OR s."notes" ILIKE ${like}
      )
    ORDER BY "rank" DESC, s."slideNumber" ASC
    LIMIT ${limit}
  `;
  return rows.map(r => ({
    slideNumber: r.slideNumber,
    excerpt: makeExcerpt(r.text, term)
  }));
}
