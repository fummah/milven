# PDF Module Notes

Adds Volume-level PDF Learning Module Notes alongside the existing AI-generated
module notes. Existing module notes are unchanged.

## Data model

- `ModuleNotePdf` - title, description, `courseId`, `volumeId`, year, keywords,
  original PDF storage key, hash, size, page count, processing/search/publication
  status, pending replacement fields, creator.
- `ModuleNotePdfPage` - page number, extracted text, normalized text.
- `ModuleNotePdfPageMap` - page range with optional existing Module, Topic or
  Concept IDs.

A PDF Module Note belongs directly to a Volume. No Learning Module is required.
Migration: `apps/server/prisma/migrations/20261031_module_note_pdfs/`.

## API

Admin:

- `GET /api/module-note-pdfs/admin`
- `POST /api/module-note-pdfs/upload` (multipart PDF)
- `GET /api/module-note-pdfs/:id/page-maps`
- `PUT /api/module-note-pdfs/:id/page-maps`
- `POST /api/module-note-pdfs/:id/replace`
- `PUT /api/module-note-pdfs/:id`
- `POST /api/module-note-pdfs/:id/reindex`
- `GET /api/module-note-pdfs/:id/download`
- `DELETE /api/module-note-pdfs/:id`

Student/signed:

- `GET /api/module-note-pdfs`
- `GET /api/module-note-pdfs/search`
- `GET /api/module-note-pdfs/:id/pdf-access`
- `GET /api/module-note-pdfs/:id/search`
- `GET /api/module-note-pdfs/assets/:id/pdf?token=...`

## Upload and processing

1. Validate actual PDF signature and size.
2. Validate Course -> Volume membership.
3. Preserve the original PDF under private `MODULE_NOTE_PDF_STORAGE_DIR`.
4. Extract page text in a background worker.
5. Store page rows and PostgreSQL FTS indexes.
6. Mark READY; publication remains separate and DRAFT by default.

Replacements are staged under a pending key and swapped only after indexing
succeeds. The previous PDF remains available if replacement indexing fails.

## Viewer

`/learning/module-notes-pdf/:id?page=12`

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
Results include the Volume-level Module Note, page number and excerpt. Optional
page maps enrich results with existing Learning Module, Topic and Concept names.
Draft notes are excluded for students. Scanned PDFs are flagged as having limited
text searchability.

## UI

Admin Module Notes has two tabs:

- Learning Notes (existing AI-generated notes preserved)
- PDF Notes (upload, list, filters, preview, edit, replace, publish, download,
  delete)

Student Module Notes has:

- Learning Notes (existing tree navigation preserved)
- PDF Notes (course/volume/module/topic filters, PDF page search, viewer)

## Verification

- 12-page PDF uploaded and indexed: 12 pages; search for `inventory` returned
  pages 2, 11, 9, 3, 5.
- Draft student access denied; published access allowed for enrolled student.
- Delete removed the record, pages and private PDF.
- Migration applied to a restored production-like database.
- Existing tests: **107 server tests passed**.
- Frontend production build passed.

## Deployment

```bash
docker compose -f docker-compose.prod.yml build api frontend
docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy
docker compose -f docker-compose.prod.yml up -d api frontend
```

Storage defaults to `/app/storage/module-note-pdfs` in Docker through the
existing `/app/storage` volume.

## Limitations

- Page-mapping API is implemented; a dedicated rich admin mapping editor is not
  added in this pass.
- Scanned/image-only PDFs require future OCR.
- PDF.js text-selection layer/highlight overlay is not added; search jumps to the
  exact page.
