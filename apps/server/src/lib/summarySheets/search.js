import { Prisma } from '@prisma/client';
import { signedSummaryPdfUrl } from './storage.js';

const SHEET_SELECT = {
  id: true,
  title: true,
  description: true,
  snapshot: true,
  sourceType: true,
  level: true,
  courseId: true,
  volumeId: true,
  moduleId: true,
  year: true,
  status: true,
  processingStatus: true,
  searchIndexStatus: true,
  processingWarning: true,
  pdfPageCount: true,
  pdfVersion: true,
  keywords: true,
  course: { select: { id: true, name: true, level: true } },
  volume: { select: { id: true, name: true } },
  module: { select: { id: true, name: true } },
  topicLinks: { select: { topic: { select: { id: true, name: true } } } },
  conceptLinks: { select: { concept: { select: { id: true, name: true } } } }
};

function normalizeTerm(q) {
  return String(q || '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

export function excerpt(text, term, max = 280) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const index = term ? clean.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (index < 0) return clean.slice(0, max) + (clean.length > max ? '...' : '');
  const start = Math.max(0, index - Math.floor(max / 3));
  const end = Math.min(clean.length, start + max);
  return `${start > 0 ? '...' : ''}${clean.slice(start, end)}${end < clean.length ? '...' : ''}`;
}

function serializeSheet(sheet, user) {
  if (!sheet) return null;
  return {
    ...sheet,
    topics: (sheet.topicLinks || []).map(link => link.topic).filter(Boolean),
    concepts: (sheet.conceptLinks || []).map(link => link.concept).filter(Boolean),
    topicLinks: undefined,
    conceptLinks: undefined,
    pdfUrl: sheet.sourceType === 'UPLOADED_PDF'
      ? signedSummaryPdfUrl({
          id: sheet.id,
          userId: user?.id || null,
          admin: user?.role === 'ADMIN',
          version: sheet.pdfVersion
        })
      : null
  };
}

async function allowedCourseIds(prisma, user) {
  if (!user || user.role === 'ADMIN') return null;
  const rows = await prisma.enrollment.findMany({ where: { userId: user.id }, select: { courseId: true } });
  return rows.map(row => row.courseId);
}

function accessSql({ user, allowedIds, courseId, includeDrafts }) {
  const parts = [Prisma.sql`s."sourceType" = 'UPLOADED_PDF'`];
  if (!includeDrafts) parts.push(Prisma.sql`s."status" = 'PUBLISHED'`);
  if (courseId) parts.push(Prisma.sql`s."courseId" = ${courseId}`);
  if (allowedIds) {
    if (!allowedIds.length) return null;
    parts.push(Prisma.sql`s."courseId" IN (${Prisma.join(allowedIds)})`);
  }
  return Prisma.sql`${Prisma.join(parts, ' AND ')}`;
}

export async function searchSummarySheets(prisma, {
  q,
  user,
  courseId,
  volumeId,
  moduleId,
  topicId,
  conceptId,
  level,
  year,
  includeDrafts = false,
  limit = 24,
  offset = 0
}) {
  const term = normalizeTerm(q);
  if (term.length < 2) return { results: [], total: 0 };
  const allowedIds = await allowedCourseIds(prisma, user);
  const access = accessSql({ user, allowedIds, courseId, includeDrafts });
  if (!access) return { results: [], total: 0 };

  const filters = [access];
  if (volumeId) filters.push(Prisma.sql`s."volumeId" = ${volumeId}`);
  if (moduleId) filters.push(Prisma.sql`s."moduleId" = ${moduleId}`);
  if (level) filters.push(Prisma.sql`s."level" = ${level}::"CfaLevel"`);
  if (year) filters.push(Prisma.sql`s."year" = ${Number(year)}`);
  if (topicId) filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "SummarySheetTopic" st WHERE st."summarySheetId" = s.id AND st."topicId" = ${topicId})`);
  if (conceptId) filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "SummarySheetConcept" sc WHERE sc."summarySheetId" = s.id AND sc."conceptId" = ${conceptId})`);
  const where = Prisma.sql`${Prisma.join(filters, ' AND ')}`;
  const like = `%${term}%`;

  const rows = await prisma.$queryRaw`
    SELECT p."summarySheetId" AS "summarySheetId",
           p."pageNumber" AS "pageNumber",
           p."text" AS "text",
           ts_rank_cd(to_tsvector('english', coalesce(p."text", '')), websearch_to_tsquery('english', ${term})) AS "rank"
    FROM "SummarySheetPage" p
    JOIN "SummarySheet" s ON s.id = p."summarySheetId"
    WHERE ${where}
      AND (
        to_tsvector('english', coalesce(p."text", '')) @@ websearch_to_tsquery('english', ${term})
        OR p."text" ILIKE ${like}
      )
    ORDER BY "rank" DESC, p."pageNumber" ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countRows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM "SummarySheetPage" p
    JOIN "SummarySheet" s ON s.id = p."summarySheetId"
    WHERE ${where}
      AND (
        to_tsvector('english', coalesce(p."text", '')) @@ websearch_to_tsquery('english', ${term})
        OR p."text" ILIKE ${like}
      )
  `;

  const metadata = await prisma.summarySheet.findMany({
    where: {
      sourceType: 'UPLOADED_PDF',
      ...(includeDrafts ? {} : { status: 'PUBLISHED' }),
      ...(courseId ? { courseId } : {}),
      ...(volumeId ? { volumeId } : {}),
      ...(moduleId ? { moduleId } : {}),
      ...(level ? { level } : {}),
      ...(year ? { year: Number(year) } : {}),
      ...(allowedIds ? { courseId: { in: allowedIds } } : {}),
      ...(topicId ? { topicLinks: { some: { topicId } } } : {}),
      ...(conceptId ? { conceptLinks: { some: { conceptId } } } : {}),
      OR: [
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { snapshot: { contains: term, mode: 'insensitive' } },
        { keywords: { has: term } },
        { module: { name: { contains: term, mode: 'insensitive' } } },
        { topicLinks: { some: { topic: { name: { contains: term, mode: 'insensitive' } } } } },
        { conceptLinks: { some: { concept: { name: { contains: term, mode: 'insensitive' } } } } }
      ]
    },
    select: SHEET_SELECT,
    take: 12
  });

  const sheetIds = [...new Set([...rows.map(row => row.summarySheetId), ...metadata.map(sheet => sheet.id)])];
  const sheets = sheetIds.length
    ? await prisma.summarySheet.findMany({ where: { id: { in: sheetIds } }, select: SHEET_SELECT })
    : [];
  const byId = new Map(sheets.map(sheet => [sheet.id, sheet]));
  const results = [];

  for (const sheet of metadata) {
    results.push({
      summarySheetId: sheet.id,
      pageNumber: 1,
      excerpt: sheet.description || sheet.snapshot || sheet.title,
      matchType: 'SHEET',
      sheet: serializeSheet(sheet, user)
    });
  }
  for (const row of rows) {
    if (results.some(result => result.summarySheetId === row.summarySheetId && result.pageNumber === row.pageNumber)) continue;
    results.push({
      summarySheetId: row.summarySheetId,
      pageNumber: row.pageNumber,
      excerpt: excerpt(row.text, term),
      matchType: 'PAGE',
      sheet: serializeSheet(byId.get(row.summarySheetId), user)
    });
  }

  return { results: results.slice(0, Math.max(limit, 24)), total: (countRows?.[0]?.count || 0) + metadata.length };
}

export async function searchWithinSummarySheet(prisma, id, q, limit = 100) {
  const term = normalizeTerm(q);
  if (term.length < 2) return [];
  const like = `%${term}%`;
  const rows = await prisma.$queryRaw`
    SELECT p."pageNumber" AS "pageNumber", p."text" AS "text",
           ts_rank_cd(to_tsvector('english', coalesce(p."text", '')), websearch_to_tsquery('english', ${term})) AS "rank"
    FROM "SummarySheetPage" p
    WHERE p."summarySheetId" = ${id}
      AND (
        to_tsvector('english', coalesce(p."text", '')) @@ websearch_to_tsquery('english', ${term})
        OR p."text" ILIKE ${like}
      )
    ORDER BY "rank" DESC, p."pageNumber" ASC
    LIMIT ${limit}
  `;
  return rows.map(row => ({
    pageNumber: row.pageNumber,
    excerpt: excerpt(row.text, term)
  }));
}

export { serializeSheet };
