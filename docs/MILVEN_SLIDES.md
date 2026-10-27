# Milven Slides

Curriculum-aligned PowerPoint presentations, searchable slide text, and a student
slide viewer integrated into the existing Milven Finance School platform.

## Architecture

Milven Slides reuses the existing academic hierarchy and foreign keys:

```text
Course (Level)
  └── Volume
       └── Module (Learning Module)
            └── Topic
                 └── Concept
```

No duplicate course, volume, module, topic or concept tables were introduced.
`Presentation.courseId`, `volumeId` and `moduleId` are foreign keys into the
existing tables. Topic and concept coverage use join tables
(`PresentationTopic`, `PresentationConcept`).

### New database entities

- `Presentation` — metadata, existing hierarchy IDs, storage keys, status,
  processing state, file hash, soft-delete timestamp.
- `PresentationSlide` — one row per slide, extracted text/notes, preview and
  thumbnail storage keys. A unique `(presentationId, slideNumber)` constraint
  makes slide deep links stable.
- `PresentationTopic` / `PresentationConcept` — many-to-many academic mappings.
- `PresentationBatch` — ZIP imports, retained archive, mapping analysis and
  aggregate import/processing results.

Migration: `apps/server/prisma/migrations/20261027_milven_slides/migration.sql`
(also creates a PostgreSQL GIN full-text index and `pg_trgm` indexes on slide
text).

### Backend modules

- `apps/server/src/routes/slides.js` — admin and student APIs, asset serving,
  access control, ZIP workflow.
- `apps/server/src/lib/slides/storage.js` — private storage keys, safe path
  resolution, short-lived signed asset tokens.
- `apps/server/src/lib/slides/pptx.js` — PPTX validation, slide order, text and
  speaker-note extraction (Open XML, no AI, no layout re-creation).
- `apps/server/src/lib/slides/renderer.js` — LibreOffice headless PPTX → PDF,
  Poppler PDF → JPEG full-size previews and thumbnails.
- `apps/server/src/lib/slides/worker.js` — concurrency-limited background
  processing, retries, batch counters, restart recovery.
- `apps/server/src/lib/slides/zipImport.js` — safe ZIP analysis, conservative
  matching, extraction and bulk import.
- `apps/server/src/lib/slides/search.js` — PostgreSQL full-text + partial-word
  search with relevance ranking and authorization filters.

### Frontend

- `/admin/slides` — card/table library, cascading filters, search, upload,
  edit, replace, publish/unpublish, download, delete, retry.
- `/student/slides` — enrolled-course hierarchy, presentation cards, global
  slide search, previous/next module navigation and links to the other module
  resources.
- `/learning/slides/:presentationId?slide=24` — full-screen viewer with
  thumbnail navigator, in-presentation search, zoom, jump-to-slide, keyboard,
  swipe, fullscreen and deep-link URL state.
- `AdminTopics` — “Add Slides” row action and linked presentation counts.
- `StudentLearning` — slide availability and direct links per learning module.

## Storage and conversion

Originals and rendered assets are stored outside the public `/uploads` folder:

```text
SLIDES_STORAGE_DIR/
  presentations/<presentation-id>/original.pptx
  presentations/<presentation-id>/presentation.pdf
  presentations/<presentation-id>/preview/slide-0001.jpg
  presentations/<presentation-id>/thumbs/thumb-0001.jpg
  imports/<batch-id>/archive.zip
```

Display assets are served only through `/api/slides/assets/...` using
short-lived signed tokens. Original PowerPoint downloads require an admin
bearer token. Students can download the current rendered slide where allowed.

Processing pipeline:

```text
Upload → private original → background queue → LibreOffice PDF
       → per-slide JPEG previews + thumbnails → slide text extraction
       → PostgreSQL search indexes → READY (publishable)
```

The original archive is retained for batch retries. Processing state is stored
in the database and interrupted `PENDING`/`PROCESSING` records are re-queued on
server start.

## API summary

Admin (ADMIN role required):

- `GET /api/slides/admin/presentations`
- `POST /api/slides/admin/presentations` (multipart `.pptx`)
- `PUT /api/slides/admin/presentations/:id`
- `POST /api/slides/admin/presentations/:id/replace`
- `PATCH /api/slides/admin/presentations/:id/publish`
- `DELETE /api/slides/admin/presentations/:id`
- `GET /api/slides/admin/presentations/:id/download`
- `POST /api/slides/admin/presentations/:id/retry`
- `GET /api/slides/admin/module-counts`
- `POST /api/slides/admin/zip/analyze`
- `POST /api/slides/admin/zip/:batchId/import`
- `GET /api/slides/admin/batches/:batchId`
- `POST /api/slides/admin/batches/:batchId/retry`
- `GET /api/slides/admin/stats`

Student (enrolment checked):

- `GET /api/slides/library/courses`
- `GET /api/slides/library/hierarchy?courseId=`
- `GET /api/slides/library/presentations?courseId=&volumeId=&moduleId=`
- `GET /api/slides/presentations/:id`
- `GET /api/slides/presentations/:id/slides`
- `GET /api/slides/presentations/:id/search?q=`
- `GET /api/slides/search?q=&courseId=...`

## Security

- ADMIN role checks on every management endpoint.
- Course enrolment checks on every student metadata, slide and search request.
- Draft/unpublished presentations are excluded from student lists and search;
  direct access returns 404.
- Storage paths cannot escape `SLIDES_STORAGE_DIR`.
- Signed asset tokens expire after two hours and embed the presentation ID,
  asset kind and admin flag.
- ZIP-slip protection, archive entry count and expansion limits, 500 MB PPTX
  limit, 2 GB ZIP limit, PPTX Open XML validation, file hash recording.
- Uploaded originals are not publicly served.
- Global API rate limiting remains in force; rendering concurrency defaults to 2.
- Soft delete removes slide rows, mappings, rendered assets and search entries
  from all user-visible responses.

## Deployment requirements

1. PostgreSQL with the new migration applied:
   - production: `prisma migrate deploy`
   - development in this repo: `npm run migrate` (`prisma db push`)
   - start the API once so the search indexes are ensured (the migration also
     creates them).
2. LibreOffice headless (Impress) and Poppler (`pdftoppm`, `pdfinfo`) installed
   on the API host or included in the API image.
3. Persistent storage for `SLIDES_STORAGE_DIR` (Docker examples mount
   `./apps/server/storage` to `/app/storage`).
4. Environment variables (see `apps/server/.env.example`):
   - `SLIDES_STORAGE_DIR`
   - optional `LIBREOFFICE_PATH`, `PDFTOPPM_PATH`
   - `SLIDES_CONCURRENCY` (default 2)
   - `SLIDES_MAX_ATTEMPTS` (default 3)
5. For multiple API replicas, replace the in-process queue with a shared job
   runner/lock so a presentation is not processed by more than one replica.

The API Dockerfile now installs `libreoffice-impress`, `poppler-utils` and
Liberation fonts. The image is correspondingly larger.

## Verified test results

Environment: Windows, PostgreSQL 18, LibreOffice 26.8.1, Poppler 25.07,
Node 22.17, production-like restored Milven database.

Source archive: the supplied `CFA Level 1 Slides.zip` contains the Fixed Income
folder used for this integration test. The Fixed Income subset is 20 `.pptx`
files (19 learning-module decks plus one whole-volume review), exactly matching
the expected shape.

Import result (Fixed Income subset, mapped to existing CFA I → Fixed Income →
Learning Module IDs):

- Detected: 20 files
- Imported: 20
- Skipped: 0
- Failed: 0
- Learning modules covered: 19
- Whole-volume reviews: 1
- Slides: **1,982**
- All 20 presentations: `READY` and `PUBLISHED`
- Slide rows: 1,982; missing preview/thumbnail keys: 0
- Rendered previews: 1,982 JPEGs; thumbnails: 1,982 JPEGs; PDFs: 20
- Student hierarchy: 20 presentations across 19 modules + 1 volume review
- Student library: 20 presentations / 1,982 slides

Functional checks executed:

- Course, volume and module mapping used existing IDs.
- Whole-volume review mapped with `moduleId = NULL`.
- Manual `.pptx` upload rendered 96 slides and was published.
- Bulk ZIP analysis matched 20/20 Fixed Income files; 0 duplicates for this
  subset. A broad all-volume archive analysis also ran (93 files, conservative
  unmatched files left for administrator review).
- Slide text search for “modified duration” returned 83 matches; the first
  result opened slide 28 of “Yield-Based Bond Duration Measures and Properties”
  and served a 200 JPEG preview.
- In-presentation search and signed slide thumbnails worked.
- Draft gating: after unpublishing one deck, student library dropped to 19 decks
  / 1,886 slides and direct access returned 404; republishing restored 20 /
  1,982.
- Replacement regenerated 96 previews and the search index while retaining the
  presentation ID and mapping.
- Deletion removed the deck from student views, slide rows, mappings and
  storage assets.
- Queue recovery logic re-queues interrupted `PROCESSING` jobs on restart.
- `apps/server/test/slides.integration.test.mjs` covers hierarchy access,
  draft visibility, signed assets, publishing gates, hierarchy validation and
  restart recovery. Full server suite: **98 tests passed**.
- Frontend production build completed successfully.

## Known limitations

- Rendering fidelity depends on LibreOffice, installed fonts and the source
  deck. Animations, transitions and interactive PowerPoint features are not
  reproduced; each slide is a static image (formulas, charts and layout are
  preserved by the renderer).
- Text extraction reads Open XML text runs and speaker notes. Text baked into
  images, SmartArt rendered as shapes, or equation objects may not be
  searchable. Common formula text is indexed when stored as text.
- The broad all-volume archive contains folder/volume naming differences, so
  some files remain unmatched for manual confirmation by design. No uncertain
  fuzzy match is auto-imported.
- The background queue is database-backed but runs in-process; a single API
  instance is assumed. Horizontal scaling needs a shared queue/lock.
- Pinch-to-zoom is not implemented; button-based zoom, fit-to-screen and swipe
  navigation are provided. The mobile thumbnail navigator is a drawer.
- No automatic topic/concept suggestion from slide text yet (the join tables
  and admin multi-select are ready for it).
- Antivirus scanning is not included; run an AV scanner on uploads in
  production if required.
