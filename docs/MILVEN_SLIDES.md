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
  Poppler PDF → 1920x1080 PNG previews and 480x270 JPEG thumbnails.
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
  presentations/<presentation-id>/versions/<render-version>/presentation.pdf
  presentations/<presentation-id>/versions/<render-version>/preview/slide-0001.png
  presentations/<presentation-id>/versions/<render-version>/thumbs/thumb-0001.jpg
  imports/<batch-id>/archive.zip
```

Display assets are served only through `/api/slides/assets/...` using
short-lived signed tokens. Original PowerPoint downloads require an admin
bearer token. Students can download the current rendered slide where allowed.

Processing pipeline:

```text
Upload → private original → background queue → LibreOffice PDF
       → per-slide 1920x1080 PNG previews + 480x270 JPEG thumbnails → slide text extraction
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
- `POST /api/slides/admin/presentations/:id/regenerate`
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

## Rate limiting, polling and processing status

### 429 root cause

The global Express rate limiter (default 1000 requests / 15 minutes / IP) was
applied to every /api route. Slide thumbnails and previews under
/api/slides/assets were counted in the same per-IP bucket as login, courses,
questions and AI generation. A single 98-slide viewer could therefore consume a
large part of the shared quota, and polling/other pages could push the same IP
over the limit. Nginx/Caddy contain no matching request-rate rule; the observed
429s originate from Express.

### 429 fixes

- Slide asset GETs are skipped by the global limiter and use a separate
  per-IP asset limiter (default 20,000 / 15 minutes):
  `SLIDE_ASSET_RATE_LIMIT_MAX`.
- Login, uploads, AI generation and normal academic APIs remain under the strict
  global limiter.
- Versioned asset URLs return
  `Cache-Control: private, max-age=31536000, immutable` so repeat views use the
  browser cache.
- Viewer thumbnails use IntersectionObserver so only visible/near-visible
  thumbnails request bytes; the active preview loads first and adjacent previews
  are prefetched.
- Admin processing polling runs only while a visible row is PENDING/PROCESSING,
  stops on READY/FAILED/unmount and backs off on 429 using Retry-After.
- ZIP batch polling uses recursive timeouts, stops on terminal status/close and
  backs off on 429.

### Processing status

- Upload, rendering and publication are separate states. Publication no longer
  drives the processing indicator.
- Worker transitions are PENDING -> PROCESSING -> READY/FAILED.
- On restart, interrupted PROCESSING jobs are re-queued.
- A watchdog marks jobs stuck in PROCESSING beyond
  `SLIDES_STALL_TIMEOUT_MINUTES` (default 60) as FAILED with a retry message,
  instead of leaving an endless spinner.
- Admin library polls only while processing is genuinely active and refreshes
  statistics when the last job completes.
- Search text/index data is written in the same transaction as slide rows, so
  READY means search data is ready; there is no independent indexing spinner
  that can remain stuck. A failed transaction keeps the previous preview and
  marks the job FAILED.

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
   - `SLIDES_STALL_TIMEOUT_MINUTES` (default 60)
   - `SLIDES_PREVIEW_WIDTH` (default 1920), `SLIDES_THUMB_WIDTH` (default 480)
   - `SLIDE_ASSET_RATE_LIMIT_MAX` (default 20000)
5. For multiple API replicas, replace the in-process queue with a shared job
   runner/lock so a presentation is not processed by more than one replica.

The API Dockerfile now installs `libreoffice-impress`, `poppler-utils`,
fontconfig, Liberation, Carlito, Caladea and Latin Modern Math fonts. Exact
Microsoft **Aptos** and **Cambria Math** are proprietary and are not bundled.

Deliberate metric-compatible substitutions are configured in
`apps/server/docker/fonts.conf`:

- Aptos / Aptos Display / Calibri -> Carlito
- Cambria -> Caladea
- Cambria Math -> Latin Modern Math
- Arial -> Liberation Sans
- Times New Roman -> Liberation Serif

These substitutions prevent arbitrary font fallback. They do **not** reproduce
Aptos exactly. If true Office fidelity is required, mount licensed Aptos and
Cambria Math fonts into `/usr/share/fonts/truetype/milven` in the API container
and run `fc-cache -f`; the preflight will then stop reporting those fonts as
missing.

Preview sizing is configurable with `SLIDES_PREVIEW_WIDTH` (default 1920) and
`SLIDES_THUMB_WIDTH` (default 480).

## Rendering fidelity fix

### Root cause

The supplied deck declares only **Aptos** (8,826 runs) and **Cambria Math**
(261 runs). The Debian API container installed Liberation fonts only. Aptos and
Cambria Math were therefore absent, and LibreOffice/fontconfig chose an
arbitrary fallback with different glyph widths. That changed line breaking and
produced the wide/stretched character spacing seen in the browser preview.
The old pipeline also rasterized at only 96 DPI (1280x720 JPEG), so the browser
had to upscale text on larger displays.

### Fixes

- Extract required font families from the PPTX theme, masters, layouts and
  slides during processing.
- Preflight exact installed families with `fc-list` (Linux) or the Windows font
  collection; `fc-match` results are only recorded as substitutes and are never
  treated as installed proof.
- Install licensed OFL fonts (Carlito, Caladea, Latin Modern Math, Liberation)
  and deterministic fontconfig aliases. Do not download or redistribute Aptos
  or Cambria Math.
- Keep LibreOffice PDF as the master and render full-size previews at
  1920x1080 PNG (`-scale-to 1920`, vector anti-aliasing enabled). Thumbnails are
  separate 480x270 JPEGs.
- Version all rendered assets under
  `presentations/<id>/versions/<version>/`. Database keys switch only after a
  successful transaction; a failed reprocess leaves the previous previews and
  search index intact.
- Add cache-busting `v=<renderVersion>` to signed asset URLs.
- Add **Regenerate Preview** to the presentation actions menu. It reuses the
  stored original and preserves ID, title, hierarchy, mappings and status.
  To migrate an existing library: Admin -> Milven Slides -> presentation menu
  (...) -> **Regenerate Preview**. Repeat per deck; the old previews remain live
  until each replacement succeeds.
- Record required/missing fonts, substitutions, renderer, PDF page dimensions,
  output format/dimensions, duration and warnings in the database and show a
  **Font substitution** warning tag to administrators.
- The viewer now sets `height: auto`, `display: block` and
  `image-rendering: auto`, retaining `object-fit: contain` so previews are not
  stretched.

### Reference comparison

Reference PNGs were exported from the installed Microsoft PowerPoint for slides
1, 2, 8, 16, 24 and 45 and compared with the corrected LibreOffice output.
Slides 1, 8, 16 and 24 were visually near-identical (headings, text spacing,
formula, chart and table alignment). On slide 45 the LO header cell
"Gross ending NAV" wrapped to two lines while PowerPoint kept it on one line.
That is a residual metric difference from Aptos being unavailable on the test
machine; it is reported by diagnostics rather than claimed as exact fidelity.
A production-like Ubuntu container test was also run with the same package set
as the Dockerfile. Exact `fc-list` families confirmed that **Aptos** and
**Cambria Math** are not installed. Before the fontconfig rules, `fc-match
Aptos` returned DejaVu Sans (the arbitrary wide fallback that caused the
original spacing problem). After the rules:

- `fc-match Aptos` -> Carlito
- `fc-match "Cambria Math"` -> Latin Modern Math

The same container rendered the 98-slide deck as a 960.009x540 pt PDF, 98 PNG
previews at 1920x1080 and 98 JPEG thumbnails at 480x270. Sampled pixel
comparison against the PowerPoint reference gave mean absolute differences of
8.38-12.30/255 and 6.28-9.56% changed pixels across slides 1, 2, 8, 16, 24 and
45. The corrected Linux render keeps the slide-45 header on one line.

Residual differences are font glyph shapes (Carlito is not Aptos), occasional
line-break differences and minor table-border rendering differences between
PowerPoint and LibreOffice. Exact Aptos/Cambria Math fidelity still requires
licensed fonts (or a licensed Microsoft/Office rendering service).

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
- Existing rendered previews remain valid; newly rendered previews use
  1920x1080 PNG with separate 480x270 JPEG thumbnails
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
  and served a 200 image preview.
- In-presentation search and signed slide thumbnails worked.
- Draft gating: after unpublishing one deck, student library dropped to 19 decks
  / 1,886 slides and direct access returned 404; republishing restored 20 /
  1,982.
- Replacement regenerated 96 previews and the search index while retaining the
  presentation ID and mapping.
- The supplied **98-slide Alternative Investment Performance and Returns** deck
  was uploaded and processed successfully: 98 slides, 960.009x540 pt PDF,
  1920x1080 PNG previews, 480x270 JPEG thumbnails, 42 s processing time.
- **Regenerate Preview** was exercised on that deck and on an existing legacy
  96-slide Fixed Income deck. Both retained their ID, hierarchy, mappings and
  publication status; render versions changed and old flat preview folders were
  removed.
- Failure atomicity was tested by temporarily making the stored original
  unavailable during regeneration: processing failed, but the previous 98
  slide previews still returned HTTP 200 and remained searchable.
- Font preflight reported `Aptos` as missing on the Windows test host while
  `Cambria Math` was present. The production container will report both unless
  licensed fonts are mounted.
- Server suite now includes renderer, module-filter and stalled-job tests:
  **104 tests passed**.
- Rate-limit separation verified: asset responses advertise a 20,000/15min
  bucket, normal APIs advertise 1,000/15min; 1,050 asset requests all returned
  200 and a normal API request still returned 200 afterwards.
- Viewer thumbnail requests are visibility-gated; full previews remain 1920x1080
  and thumbnails 480x270.
- Deletion removed the deck from student views, slide rows, mappings and
  storage assets.
- Queue recovery logic re-queues interrupted `PROCESSING` jobs on restart.
- `apps/server/test/slides.integration.test.mjs` covers hierarchy access,
  draft visibility, signed assets, publishing gates, hierarchy validation and
  restart recovery. Full server suite: **100 tests passed**.
- Frontend production build completed successfully.

## Known limitations

- Exact Aptos/Cambria Math fidelity cannot be guaranteed without licensed
  Microsoft fonts. The container uses Carlito/Latin Modern Math substitutions;
  diagnostics explicitly report this. The local Office reference comparison
  showed one residual line-wrap difference (slide 45) caused by missing Aptos.
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
