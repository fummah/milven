ALTER TABLE "ModuleNote" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'AI_GENERATED';
ALTER TABLE "Formula" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'AI_GENERATED';

CREATE INDEX "ModuleNote_sourceType_idx" ON "ModuleNote"("sourceType");
CREATE INDEX "Formula_sourceType_idx" ON "Formula"("sourceType");
