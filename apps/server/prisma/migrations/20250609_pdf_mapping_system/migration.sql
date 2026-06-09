-- CreateEnum
CREATE TYPE "MappingTargetType" AS ENUM ('MODULE', 'TOPIC', 'CONCEPT');

-- CreateTable
CREATE TABLE "PdfMapping" (
    "id" TEXT NOT NULL,
    "volumeId" TEXT NOT NULL,
    "curriculumDocumentId" TEXT NOT NULL,
    "targetType" "MappingTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "pageLabel" TEXT,
    "yOffset" FLOAT DEFAULT 0,
    "sectionTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdfMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PdfMapping_volumeId_targetType_targetId_key" ON "PdfMapping"("volumeId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "PdfMapping_curriculumDocumentId_idx" ON "PdfMapping"("curriculumDocumentId");

-- CreateIndex
CREATE INDEX "PdfMapping_pageNumber_idx" ON "PdfMapping"("pageNumber");

-- AddForeignKey
ALTER TABLE "PdfMapping" ADD CONSTRAINT "PdfMapping_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "Volume"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfMapping" ADD CONSTRAINT "PdfMapping_curriculumDocumentId_fkey" FOREIGN KEY ("curriculumDocumentId") REFERENCES "CurriculumDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
