# PDF Formula Books

Adds Volume-level PDF Formula Books alongside existing formula cards and the AI
formula generator. Existing formula cards are unchanged.

## Data model

- `FormulaBookPdf` — title, description, `courseId`, `volumeId`, year, keywords,
  original PDF storage key, hash, size, page count, processing/search/publication
  status, pending replacement fields, creator.
- `FormulaBookPdfPage` — page number, extracted text, normalized text.
- `FormulaBookPdfPageMap` — page range with optional existing Module, Topic or
  Concept IDs.

A Formula Book belongs directly to a Volume. No Learning Module is required.
Migration: `apps/server/prisma/migrations/20261030_formula_book_pdfs/`.

## API

Admin:

- `GET /api/formula-books/admin`
- `POST /api/formula-books/upload` (multipart PDF)
- `GET /api/formula-books/:id/page-maps`
- `PUT /api/formula-books/:id/page-maps`
- `POST /api/formula-books/:id/replace`
- `PUT /api/formula-books/:id`
- `POST /api/formula-books/:id/reindex`
- `GET /api/formula-books/:id/download`
- `DELETE /api/formula-books/:id`

Student/signed:

- `GET /api/formula-books`
- `GET /api/formula-books/search`
- `GET /api/formula-books/:id/pdf-access`
- `GET /api/formula-books/:id/search`
- `GET /api/formula-books/assets/:id/pdf?token=...`

## Upload and processing

1. Validate actual PDF signature and size.
2. Validate Course → Volume membership.
3. Preserve original PDF under private `FORMULA_BOOK_STORAGE_DIR`.
4. Extract page text in a background worker.
5. Store page rows and PostgreSQL FTS indexes.
6. Mark READY; publication remains separate and DRAFT by default.

Replacements are staged under a pending key and swapped only after indexing
succeeds. The previous PDF remains available if replacement indexing fails.

## Viewer

`/learning/formula-books/:id?page=12`

Reuses the PDF.js approach from Summary Sheets:

- Original PDF rendered to canvas
- Page thumbnails rendered client-side and lazy-loaded
- Search within PDF
- Zoom, fit width/page, fullscreen, keyboard and mobile swipe
- URL page state
- Admin preview and Draft badges
- Download through an authorized endpoint

## Search

Page text is indexed with PostgreSQL FTS + trigram/ILIKE partial matching.
Results include the Volume-level Formula Book, page number and excerpt. Optional
page maps enrich results with existing Learning Module, Topic and Concept names.
Draft books are excluded for students. Scanned PDFs are flagged as having limited
text searchability.

## UI

Admin Formula Book Master has two tabs:

- Formula Cards (existing functionality preserved)
- PDF Formula Books (upload, list, filters, preview, edit, replace, publish,
  download, delete)

Student Formula Book has:

- Formula Cards (existing functionality preserved)
- PDF Formula Books (course/volume/module/topic filters, PDF page search, viewer)
- Combined search results show matching formula cards and PDF pages

## Verification

- 12-page PDF uploaded and indexed: 12 pages, search for `inventory` returned
  pages 2, 11, 9, 3, 5.
- Formula Book page maps validated against existing Volume hierarchy.
- Draft student access denied; published access allowed for enrolled student.
- Delete removed record, pages and private PDF.
- Migration applied to a restored production-like database.
- Existing formula tests: **107 server tests passed**.
- Frontend production build passed.

## Deployment

```bash
docker compose -f docker-compose.prod.yml build api frontend
docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy
docker compose -f docker-compose.prod.yml up -d api frontend
```

Storage defaults to `/app/storage/formula-books` in Docker through the existing
`/app/storage` volume.

## Limitations

- Page-mapping API is implemented; a dedicated rich admin mapping editor is not
  added in this pass.
- Scanned/image-only PDFs require future OCR.
- PDF.js text-selection layer/highlight overlay is not added; search jumps to the
  exact page.
