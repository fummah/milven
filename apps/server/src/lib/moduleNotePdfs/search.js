import { Prisma } from '@prisma/client';
import { signedModuleNotePdfUrl, signedModuleNotePdfThumbnailUrl } from './storage.js';

const BOOK_SELECT = {
  id: true,
  title: true,
  description: true,
  courseId: true,
  volumeId: true,
  year: true,
  pageCount: true,
  publicationStatus: true,
  processingStatus: true,
  searchIndexStatus: true,
  pdfVersion: true,
  keywords: true,
  originalFilename: true,
  fileSize: true,
  createdAt: true,
  updatedAt: true,
  course: { select: { id: true, name: true, level: true } },
  volume: { select: { id: true, name: true } },
  pageMaps: {
    select: {
      pageStart: true,
      pageEnd: true,
      module: { select: { id: true, name: true } },
      topic: { select: { id: true, name: true } },
      concept: { select: { id: true, name: true } }
    }
  }
};

function normalizeTerm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

export function excerpt(text, term, max = 280) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const idx = term ? clean.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (idx < 0) return clean.slice(0, max) + (clean.length > max ? '...' : '');
  const start = Math.max(0, idx - Math.floor(max / 3));
  const end = Math.min(clean.length, start + max);
  return `${start > 0 ? '...' : ''}${clean.slice(start, end)}${end < clean.length ? '...' : ''}`;
}

function serializeBook(book, user) {
  if (!book) return null;
  const maps = book.pageMaps || [];
  return {
    ...book,
    pageMaps: undefined,
    pdfUrl: signedModuleNotePdfUrl({
      id: book.id,
      userId: user?.id || null,
      admin: user?.role === 'ADMIN',
      version: book.pdfVersion
    }),
    thumbnailUrl: signedModuleNotePdfThumbnailUrl({
      id: book.id,
      userId: user?.id || null,
      admin: user?.role === 'ADMIN',
      version: book.pdfVersion
    })
  };
}

function academicForPage(book, pageNumber) {
  const maps = (book?.pageMaps || []).filter(map => pageNumber >= map.pageStart && pageNumber <= map.pageEnd);
  return maps.map(map => ({
    module: map.module || null,
    topic: map.topic || null,
    concept: map.concept || null
  }));
}

async function allowedCourseIds(prisma, user) {
  if (!user || user.role === 'ADMIN') return null;
  const rows = await prisma.enrollment.findMany({ where: { userId: user.id }, select: { courseId: true } });
  return rows.map(row => row.courseId);
}

function accessSql({ allowedIds, courseId, includeDrafts }) {
  const parts = [];
  if (!includeDrafts) parts.push(Prisma.sql`b."publicationStatus" = 'PUBLISHED'`);
  if (courseId) parts.push(Prisma.sql`b."courseId" = ${courseId}`);
  if (allowedIds) {
    if (!allowedIds.length) return null;
    parts.push(Prisma.sql`b."courseId" IN (${Prisma.join(allowedIds)})`);
  }
  return parts.length ? Prisma.sql`${Prisma.join(parts, ' AND ')}` : Prisma.sql`TRUE`;
}

export async function searchModuleNotePdfs(prisma, {
  q,
  user,
  courseId,
  volumeId,
  moduleId,
  topicId,
  conceptId,
  year,
  includeDrafts = false,
  limit = 24,
  offset = 0
}) {
  const term = normalizeTerm(q);
  if (term.length < 2) return { results: [], total: 0 };
  const allowedIds = await allowedCourseIds(prisma, user);
  const access = accessSql({ allowedIds, courseId, includeDrafts });
  if (!access) return { results: [], total: 0 };

  const filters = [access];
  if (volumeId) filters.push(Prisma.sql`b."volumeId" = ${volumeId}`);
  if (year) filters.push(Prisma.sql`b."year" = ${Number(year)}`);
  if (moduleId) filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "ModuleNotePdfPageMap" m WHERE m."moduleNotePdfId" = b.id AND m."moduleId" = ${moduleId} AND p."pageNumber" BETWEEN m."pageStart" AND m."pageEnd")`);
  if (topicId) filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "ModuleNotePdfPageMap" m WHERE m."moduleNotePdfId" = b.id AND m."topicId" = ${topicId} AND p."pageNumber" BETWEEN m."pageStart" AND m."pageEnd")`);
  if (conceptId) filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "ModuleNotePdfPageMap" m WHERE m."moduleNotePdfId" = b.id AND m."conceptId" = ${conceptId} AND p."pageNumber" BETWEEN m."pageStart" AND m."pageEnd")`);
  const where = Prisma.sql`${Prisma.join(filters, ' AND ')}`;
  const like = `%${term}%`;

  const rows = await prisma.$queryRaw`
    SELECT p."moduleNotePdfId" AS "bookId", p."pageNumber" AS "pageNumber", p."text" AS "text",
           ts_rank_cd(to_tsvector('english', coalesce(p."text", '')), websearch_to_tsquery('english', ${term})) AS "rank"
    FROM "ModuleNotePdfPage" p
    JOIN "ModuleNotePdf" b ON b.id = p."moduleNotePdfId"
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
    FROM "ModuleNotePdfPage" p
    JOIN "ModuleNotePdf" b ON b.id = p."moduleNotePdfId"
    WHERE ${where}
      AND (
        to_tsvector('english', coalesce(p."text", '')) @@ websearch_to_tsquery('english', ${term})
        OR p."text" ILIKE ${like}
      )
  `;

  const metadata = await prisma.moduleNotePdf.findMany({
    where: {
      ...(includeDrafts ? {} : { publicationStatus: 'PUBLISHED' }),
      ...(courseId ? { courseId } : {}),
      ...(volumeId ? { volumeId } : {}),
      ...(year ? { year: Number(year) } : {}),
      ...(allowedIds ? { courseId: { in: allowedIds } } : {}),
      ...(moduleId ? { pageMaps: { some: { moduleId } } } : {}),
      ...(topicId ? { pageMaps: { some: { topicId } } } : {}),
      ...(conceptId ? { pageMaps: { some: { conceptId } } } : {}),
      OR: [
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { keywords: { has: term } },
        { volume: { name: { contains: term, mode: 'insensitive' } } }
      ]
    },
    select: BOOK_SELECT,
    take: 12
  });

  const bookIds = [...new Set([...rows.map(row => row.bookId), ...metadata.map(book => book.id)])];
  const books = bookIds.length
    ? await prisma.moduleNotePdf.findMany({ where: { id: { in: bookIds } }, select: BOOK_SELECT })
    : [];
  const byId = new Map(books.map(book => [book.id, book]));
  const results = [];

  for (const book of metadata) {
    results.push({
      moduleNotePdfId: book.id,
      pageNumber: 1,
      excerpt: book.description || book.title,
      matchType: 'BOOK',
      academic: academicForPage(book, 1),
      book: serializeBook(book, user)
    });
  }
  for (const row of rows) {
    if (results.some(result => result.moduleNotePdfId === row.bookId && result.pageNumber === row.pageNumber)) continue;
    results.push({
      moduleNotePdfId: row.bookId,
      pageNumber: row.pageNumber,
      excerpt: excerpt(row.text, term),
      matchType: 'PAGE',
      academic: academicForPage(byId.get(row.bookId), row.pageNumber),
      book: serializeBook(byId.get(row.bookId), user)
    });
  }

  return { results: results.slice(0, Math.max(limit, 24)), total: (countRows?.[0]?.count || 0) + metadata.length };
}

export async function searchWithinModuleNote(prisma, id, q, limit = 100) {
  const term = normalizeTerm(q);
  if (term.length < 2) return [];
  const like = `%${term}%`;
  const rows = await prisma.$queryRaw`
    SELECT p."pageNumber" AS "pageNumber", p."text" AS "text",
           ts_rank_cd(to_tsvector('english', coalesce(p."text", '')), websearch_to_tsquery('english', ${term})) AS "rank"
    FROM "ModuleNotePdfPage" p
    WHERE p."moduleNotePdfId" = ${id}
      AND (
        to_tsvector('english', coalesce(p."text", '')) @@ websearch_to_tsquery('english', ${term})
        OR p."text" ILIKE ${like}
      )
    ORDER BY "rank" DESC, p."pageNumber" ASC
    LIMIT ${limit}
  `;
  return rows.map(row => ({ pageNumber: row.pageNumber, excerpt: excerpt(row.text, term) }));
}

export { serializeBook };
