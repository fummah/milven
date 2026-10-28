-- Uploaded PDF summary sheets alongside existing AI-generated sheets.
ALTER TABLE "SummarySheet"
    ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'AI_GENERATED',
    ADD COLUMN "description" TEXT,
    ADD COLUMN "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "pdfStorageKey" TEXT,
    ADD COLUMN "originalFilename" TEXT,
    ADD COLUMN "pdfFileHash" TEXT,
    ADD COLUMN "pdfFileSize" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "pdfPageCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "pdfVersion" TEXT,
    ADD COLUMN "processingStatus" TEXT NOT NULL DEFAULT 'READY',
    ADD COLUMN "searchIndexStatus" TEXT NOT NULL DEFAULT 'READY',
    ADD COLUMN "processingError" TEXT,
    ADD COLUMN "processingWarning" TEXT,
    ADD COLUMN "processingAttempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "searchIndexedAt" TIMESTAMP(3),
    ADD COLUMN "pendingPdfKey" TEXT,
    ADD COLUMN "pendingPdfHash" TEXT,
    ADD COLUMN "pendingPdfSize" INTEGER,
    ADD COLUMN "pendingPdfVersion" TEXT,
    ADD COLUMN "pendingFilename" TEXT,
    ADD COLUMN "createdById" TEXT;

CREATE INDEX "SummarySheet_sourceType_status_idx" ON "SummarySheet"("sourceType", "status");

ALTER TABLE "SummarySheet"
    ADD CONSTRAINT "SummarySheet_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SummarySheetPage" (
    "id" TEXT NOT NULL,
    "summarySheetId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "text" TEXT,
    "normalizedText" TEXT,
    "thumbnailKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SummarySheetPage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SummarySheetTopic" (
    "summarySheetId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    CONSTRAINT "SummarySheetTopic_pkey" PRIMARY KEY ("summarySheetId", "topicId")
);

CREATE TABLE "SummarySheetConcept" (
    "summarySheetId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    CONSTRAINT "SummarySheetConcept_pkey" PRIMARY KEY ("summarySheetId", "conceptId")
);

CREATE UNIQUE INDEX "SummarySheetPage_summarySheetId_pageNumber_key"
    ON "SummarySheetPage"("summarySheetId", "pageNumber");
CREATE INDEX "SummarySheetPage_summarySheetId_pageNumber_idx"
    ON "SummarySheetPage"("summarySheetId", "pageNumber");
CREATE INDEX "SummarySheetTopic_topicId_idx" ON "SummarySheetTopic"("topicId");
CREATE INDEX "SummarySheetConcept_conceptId_idx" ON "SummarySheetConcept"("conceptId");

ALTER TABLE "SummarySheetPage" ADD CONSTRAINT "SummarySheetPage_summarySheetId_fkey"
    FOREIGN KEY ("summarySheetId") REFERENCES "SummarySheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SummarySheetTopic" ADD CONSTRAINT "SummarySheetTopic_summarySheetId_fkey"
    FOREIGN KEY ("summarySheetId") REFERENCES "SummarySheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SummarySheetTopic" ADD CONSTRAINT "SummarySheetTopic_topicId_fkey"
    FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SummarySheetConcept" ADD CONSTRAINT "SummarySheetConcept_summarySheetId_fkey"
    FOREIGN KEY ("summarySheetId") REFERENCES "SummarySheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SummarySheetConcept" ADD CONSTRAINT "SummarySheetConcept_conceptId_fkey"
    FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "SummarySheetPage_fts_idx"
    ON "SummarySheetPage"
    USING GIN (to_tsvector('english', coalesce("text", '')));
CREATE INDEX IF NOT EXISTS "SummarySheetPage_text_trgm_idx"
    ON "SummarySheetPage"
    USING GIN ("text" gin_trgm_ops);
