-- Volume-level PDF Formula Books. Formula cards remain untouched.
CREATE TABLE "FormulaBookPdf" (
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
    CONSTRAINT "FormulaBookPdf_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FormulaBookPdfPage" (
    "id" TEXT NOT NULL,
    "formulaBookPdfId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "text" TEXT,
    "normalizedText" TEXT,
    "thumbnailKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FormulaBookPdfPage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FormulaBookPdfPageMap" (
    "id" TEXT NOT NULL,
    "formulaBookPdfId" TEXT NOT NULL,
    "pageStart" INTEGER NOT NULL,
    "pageEnd" INTEGER NOT NULL,
    "moduleId" TEXT,
    "topicId" TEXT,
    "conceptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FormulaBookPdfPageMap_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FormulaBookPdf_courseId_volumeId_idx" ON "FormulaBookPdf"("courseId", "volumeId");
CREATE INDEX "FormulaBookPdf_publicationStatus_processingStatus_idx" ON "FormulaBookPdf"("publicationStatus", "processingStatus");
CREATE UNIQUE INDEX "FormulaBookPdfPage_formulaBookPdfId_pageNumber_key" ON "FormulaBookPdfPage"("formulaBookPdfId", "pageNumber");
CREATE INDEX "FormulaBookPdfPage_formulaBookPdfId_pageNumber_idx" ON "FormulaBookPdfPage"("formulaBookPdfId", "pageNumber");
CREATE INDEX "FormulaBookPdfPageMap_formulaBookPdfId_pageStart_pageEnd_idx" ON "FormulaBookPdfPageMap"("formulaBookPdfId", "pageStart", "pageEnd");
CREATE INDEX "FormulaBookPdfPageMap_moduleId_idx" ON "FormulaBookPdfPageMap"("moduleId");
CREATE INDEX "FormulaBookPdfPageMap_topicId_idx" ON "FormulaBookPdfPageMap"("topicId");
CREATE INDEX "FormulaBookPdfPageMap_conceptId_idx" ON "FormulaBookPdfPageMap"("conceptId");

ALTER TABLE "FormulaBookPdf" ADD CONSTRAINT "FormulaBookPdf_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormulaBookPdf" ADD CONSTRAINT "FormulaBookPdf_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "Volume"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormulaBookPdf" ADD CONSTRAINT "FormulaBookPdf_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FormulaBookPdfPage" ADD CONSTRAINT "FormulaBookPdfPage_formulaBookPdfId_fkey" FOREIGN KEY ("formulaBookPdfId") REFERENCES "FormulaBookPdf"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormulaBookPdfPageMap" ADD CONSTRAINT "FormulaBookPdfPageMap_formulaBookPdfId_fkey" FOREIGN KEY ("formulaBookPdfId") REFERENCES "FormulaBookPdf"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormulaBookPdfPageMap" ADD CONSTRAINT "FormulaBookPdfPageMap_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FormulaBookPdfPageMap" ADD CONSTRAINT "FormulaBookPdfPageMap_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FormulaBookPdfPageMap" ADD CONSTRAINT "FormulaBookPdfPageMap_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "FormulaBookPdfPage_fts_idx"
    ON "FormulaBookPdfPage"
    USING GIN (to_tsvector('english', coalesce("text", '')));
CREATE INDEX IF NOT EXISTS "FormulaBookPdfPage_text_trgm_idx"
    ON "FormulaBookPdfPage"
    USING GIN ("text" gin_trgm_ops);
