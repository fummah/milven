-- Volume-level PDF Module Notes. Existing learning notes remain untouched.
CREATE TABLE "ModuleNotePdf" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "level" "CfaLevel" NOT NULL,
    "courseId" TEXT NOT NULL,
    "volumeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL DEFAULT 2026,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "originalFilename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "pdfVersion" TEXT,
    "processingStatus" TEXT NOT NULL DEFAULT 'UPLOADED',
    "searchIndexStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "publicationStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "processingError" TEXT,
    "processingWarning" TEXT,
    "processingAttempts" INTEGER NOT NULL DEFAULT 0,
    "searchIndexedAt" TIMESTAMP(3),
    "pendingStorageKey" TEXT,
    "pendingFileHash" TEXT,
    "pendingFileSize" INTEGER,
    "pendingPdfVersion" TEXT,
    "pendingFilename" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ModuleNotePdf_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModuleNotePdfPage" (
    "id" TEXT NOT NULL,
    "moduleNotePdfId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "text" TEXT,
    "normalizedText" TEXT,
    "thumbnailKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ModuleNotePdfPage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModuleNotePdfPageMap" (
    "id" TEXT NOT NULL,
    "moduleNotePdfId" TEXT NOT NULL,
    "pageStart" INTEGER NOT NULL,
    "pageEnd" INTEGER NOT NULL,
    "moduleId" TEXT,
    "topicId" TEXT,
    "conceptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ModuleNotePdfPageMap_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModuleNotePdf_courseId_volumeId_idx" ON "ModuleNotePdf"("courseId", "volumeId");
CREATE INDEX "ModuleNotePdf_publicationStatus_processingStatus_idx" ON "ModuleNotePdf"("publicationStatus", "processingStatus");
CREATE UNIQUE INDEX "ModuleNotePdfPage_moduleNotePdfId_pageNumber_key" ON "ModuleNotePdfPage"("moduleNotePdfId", "pageNumber");
CREATE INDEX "ModuleNotePdfPage_moduleNotePdfId_pageNumber_idx" ON "ModuleNotePdfPage"("moduleNotePdfId", "pageNumber");
CREATE INDEX "ModuleNotePdfPageMap_moduleNotePdfId_pageStart_pageEnd_idx" ON "ModuleNotePdfPageMap"("moduleNotePdfId", "pageStart", "pageEnd");
CREATE INDEX "ModuleNotePdfPageMap_moduleId_idx" ON "ModuleNotePdfPageMap"("moduleId");
CREATE INDEX "ModuleNotePdfPageMap_topicId_idx" ON "ModuleNotePdfPageMap"("topicId");
CREATE INDEX "ModuleNotePdfPageMap_conceptId_idx" ON "ModuleNotePdfPageMap"("conceptId");

ALTER TABLE "ModuleNotePdf" ADD CONSTRAINT "ModuleNotePdf_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModuleNotePdf" ADD CONSTRAINT "ModuleNotePdf_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "Volume"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModuleNotePdf" ADD CONSTRAINT "ModuleNotePdf_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModuleNotePdfPage" ADD CONSTRAINT "ModuleNotePdfPage_moduleNotePdfId_fkey" FOREIGN KEY ("moduleNotePdfId") REFERENCES "ModuleNotePdf"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModuleNotePdfPageMap" ADD CONSTRAINT "ModuleNotePdfPageMap_moduleNotePdfId_fkey" FOREIGN KEY ("moduleNotePdfId") REFERENCES "ModuleNotePdf"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModuleNotePdfPageMap" ADD CONSTRAINT "ModuleNotePdfPageMap_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModuleNotePdfPageMap" ADD CONSTRAINT "ModuleNotePdfPageMap_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModuleNotePdfPageMap" ADD CONSTRAINT "ModuleNotePdfPageMap_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "ModuleNotePdfPage_fts_idx"
    ON "ModuleNotePdfPage"
    USING GIN (to_tsvector('english', coalesce("text", '')));
CREATE INDEX IF NOT EXISTS "ModuleNotePdfPage_text_trgm_idx"
    ON "ModuleNotePdfPage"
    USING GIN ("text" gin_trgm_ops);
