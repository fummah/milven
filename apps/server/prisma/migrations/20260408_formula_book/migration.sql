-- CreateTable
CREATE TABLE "Formula" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "formula" TEXT NOT NULL,
    "variables" TEXT NOT NULL,
    "interpretation" TEXT NOT NULL,
    "whenToUse" TEXT NOT NULL,
    "watchOut" TEXT NOT NULL,
    "calculatorCue" TEXT,
    "losTag" TEXT,
    "level" "CfaLevel" NOT NULL,
    "courseId" TEXT,
    "volumeId" TEXT,
    "moduleId" TEXT,
    "topicId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "highYield" BOOLEAN NOT NULL DEFAULT false,
    "year" INTEGER NOT NULL DEFAULT 2026,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Formula_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Formula_courseId_volumeId_moduleId_topicId_idx" ON "Formula"("courseId", "volumeId", "moduleId", "topicId");

-- CreateIndex
CREATE INDEX "Formula_level_highYield_idx" ON "Formula"("level", "highYield");

-- AddForeignKey
ALTER TABLE "Formula" ADD CONSTRAINT "Formula_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Formula" ADD CONSTRAINT "Formula_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "Volume"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Formula" ADD CONSTRAINT "Formula_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Formula" ADD CONSTRAINT "Formula_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
