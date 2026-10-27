-- Milven Slides: presentations attached to the existing curriculum hierarchy.
-- No academic hierarchy tables are duplicated here.

CREATE TYPE "PresentationScope" AS ENUM ('LEARNING_MODULE', 'WHOLE_VOLUME');
CREATE TYPE "PresentationStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "PresentationProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

CREATE TABLE "Presentation" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "courseId" TEXT NOT NULL,
    "volumeId" TEXT NOT NULL,
    "moduleId" TEXT,
    "year" INTEGER NOT NULL DEFAULT 2027,
    "scope" "PresentationScope" NOT NULL DEFAULT 'LEARNING_MODULE',
    "originalFilename" TEXT NOT NULL,
    "fileStorageKey" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "mimeType" TEXT NOT NULL DEFAULT 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    "thumbnailKey" TEXT,
    "pdfKey" TEXT,
    "slideCount" INTEGER NOT NULL DEFAULT 0,
    "status" "PresentationStatus" NOT NULL DEFAULT 'DRAFT',
    "processingStatus" "PresentationProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "processingError" TEXT,
    "processingAttempts" INTEGER NOT NULL DEFAULT 0,
    "publishWhenReady" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "importBatchId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Presentation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PresentationSlide" (
    "id" TEXT NOT NULL,
    "presentationId" TEXT NOT NULL,
    "slideNumber" INTEGER NOT NULL,
    "text" TEXT,
    "notes" TEXT,
    "previewKey" TEXT,
    "thumbnailKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresentationSlide_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PresentationTopic" (
    "presentationId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,

    CONSTRAINT "PresentationTopic_pkey" PRIMARY KEY ("presentationId","topicId")
);

CREATE TABLE "PresentationConcept" (
    "presentationId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,

    CONSTRAINT "PresentationConcept_pkey" PRIMARY KEY ("presentationId","conceptId")
);

CREATE TABLE "PresentationBatch" (
    "id" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "archiveStorageKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ANALYZED',
    "courseId" TEXT,
    "volumeId" TEXT,
    "year" INTEGER NOT NULL DEFAULT 2027,
    "totalFiles" INTEGER NOT NULL DEFAULT 0,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "totalSlides" INTEGER NOT NULL DEFAULT 0,
    "analysisJson" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresentationBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PresentationSlide_presentationId_slideNumber_key" ON "PresentationSlide"("presentationId", "slideNumber");
CREATE INDEX "PresentationSlide_presentationId_slideNumber_idx" ON "PresentationSlide"("presentationId", "slideNumber");
CREATE INDEX "Presentation_courseId_volumeId_moduleId_idx" ON "Presentation"("courseId", "volumeId", "moduleId");
CREATE INDEX "Presentation_status_processingStatus_idx" ON "Presentation"("status", "processingStatus");
CREATE INDEX "Presentation_deletedAt_idx" ON "Presentation"("deletedAt");
CREATE INDEX "Presentation_importBatchId_idx" ON "Presentation"("importBatchId");
CREATE INDEX "PresentationTopic_topicId_idx" ON "PresentationTopic"("topicId");
CREATE INDEX "PresentationConcept_conceptId_idx" ON "PresentationConcept"("conceptId");
CREATE INDEX "PresentationBatch_createdAt_idx" ON "PresentationBatch"("createdAt");

ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "Volume"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "PresentationBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PresentationSlide" ADD CONSTRAINT "PresentationSlide_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "Presentation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PresentationTopic" ADD CONSTRAINT "PresentationTopic_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "Presentation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PresentationTopic" ADD CONSTRAINT "PresentationTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PresentationConcept" ADD CONSTRAINT "PresentationConcept_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "Presentation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PresentationConcept" ADD CONSTRAINT "PresentationConcept_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PresentationBatch" ADD CONSTRAINT "PresentationBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Full text search over rendered slide text and speaker notes. Kept separate
-- from Prisma's schema because tsvector is a PostgreSQL-only type.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "PresentationSlide_fts_idx"
    ON "PresentationSlide"
    USING GIN (to_tsvector('english', coalesce("text", '') || ' ' || coalesce("notes", '')));
CREATE INDEX IF NOT EXISTS "PresentationSlide_text_trgm_idx"
    ON "PresentationSlide"
    USING GIN ("text" gin_trgm_ops);
