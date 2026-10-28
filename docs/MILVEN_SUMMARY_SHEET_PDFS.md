# Uploaded PDF Summary Sheets

Adds uploaded PDF summary sheets alongside the existing AI-generated Summary
Sheet Master. AI sheets, their editor and their viewer are unchanged.

## Architecture

The existing academic hierarchy is reused:

```text
Course -> Volume -> Learning Module -> Topic -> Concept
```

Uploaded sheets are attached to an existing Learning Module. Optional topics
and concepts use join tables:

- `SummarySheetTopic`
- `SummarySheetConcept`

No academic records are duplicated.

## Database

`SummarySheet` gained PDF fields:

- `sourceType` (`AI_GENERATED` / `UPLOADED_PDF`)
- description, keywords
- original PDF storage key, original filename, hash, size, page count
- processing and search-index status
- pending replacement PDF fields
- creator relation

New tables:

- `SummarySheetPage` — page number, extracted text, normalized search text
- `SummarySheetTopic` / `SummarySheetConcept`

Migration:
`apps/server/prisma/migrations/20261029_summary_sheet_pdfs/migration.sql`

Existing AI-generated rows receive `AI_GENERATED` and `READY` defaults.

## Storage and processing

Original PDFs are stored outside public `/uploads`:

```text
SUMMARY_SHEET_STORAGE_DIR/
  sheets/<summary-id>/versions/<version>/original.pdf
```

The original file is never rebuilt from extracted text.

Pipeline:

```text
PDF upload -> signature/size validation -> private storage
           -> background worker -> page-by-page PDF text extraction
           -> SummarySheetPage rows -> PostgreSQL FTS indexes
           -> READY (PDF viewable while indexing)
```

Signed PDF access tokens are generated only after authorization. Students must
be enrolled and the sheet must be published. Draft PDFs return 403.

## Viewer

`/learning/summary-sheets/:id?page=5`

- PDF.js renders the original PDF directly (canvas), not HTML reconstruction
- 16:9/portrait page sizing follows the original PDF
- Page thumbnails are rendered client-side and lazy-loaded via IntersectionObserver
- Page navigation, page input, previous/next, fit width/page, zoom, fullscreen
- Keyboard and mobile swipe navigation
- URL preserves the selected page
- Search results jump to the exact page
- PDF download is authorization-checked
- Admin preview/draft badges are preserved

## Search

Endpoints:

- `GET /api/summary-sheets/search?q=&courseId=&volumeId=&moduleId=&topicId=&conceptId=`
- `GET /api/summary-sheets/:id/search?q=`

Search covers page text, title, module, topics, concepts and keywords. Page text
uses PostgreSQL full-text search plus partial-word `ILIKE`/trigram support.
Results include the exact page number and highlighted excerpt. Scanned PDFs are
detected; they remain viewable but are marked as having limited searchability.

## Admin operations

- Upload PDF drawer with Course -> Volume -> Module -> Topics -> Concepts cascading
- Source filter, page counts, indexing status
- Edit PDF metadata and mappings
- Replace PDF while preserving ID/mappings/status; old PDF stays live until indexing succeeds
- Publish/unpublish with a READY gate
- Delete removes database rows, pages and private storage
- Learning Module row action: **Add Summary Sheet**

## Rate/processing protections

- PDF asset URLs use a separate signed-asset rate bucket
- PDF.js loads one original PDF; no per-page server image requests
- Thumbnails render client-side and are visibility-gated
- Search input is debounced
- Admin indexing status polls only while READY has not been reached
- Stalled indexing jobs are marked FAILED by a watchdog; recovery re-queues
  interrupted jobs after restart

## Verification

- 12-page PDF uploaded, indexed and searched by page:
  - `inventory` returned pages 2, 11, 9, 3, 5
  - global results opened the same page numbers
- 1-page PDF upload, indexing, signed PDF fetch, publish/unpublish and draft
  access denial verified
- Replacement changed `pdfVersion` and preserved metadata
- Delete removed the summary and private storage
- Existing summary sheet tests remain green
- Server suite: **107 tests passed**
- Frontend production build: **passed**
- Migration applied successfully to a restored production-like database

## Deployment

Rebuild the API and frontend, apply migrations:

```bash
docker compose -f docker-compose.prod.yml build api frontend
docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy
docker compose -f docker-compose.prod.yml up -d api frontend
```

Keep the persistent `./apps/server/storage:/app/storage` mount.

## Known limitations

- Bulk ZIP PDF upload is not implemented in this pass.
- Page-level topic/concept ranges are not implemented; topics/concepts are
  sheet-level (which is optional in the specification).
- PDF.js text layer/highlight overlay is not added; search jumps to the correct
  page and highlights excerpts in the search panel.
- Scanned PDFs require a future controlled OCR job.
- Exact PDF rendering is handled by the browser PDF.js engine; no PDF content
  is rewritten.
