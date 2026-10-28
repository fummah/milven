-- Rendering diagnostics and versioned preview assets for Milven Slides.
ALTER TABLE "Presentation"
    ADD COLUMN "renderVersion" TEXT,
    ADD COLUMN "requiredFonts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "missingFonts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "renderingWarnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "renderingDiagnostics" JSONB,
    ADD COLUMN "previewWidth" INTEGER,
    ADD COLUMN "previewHeight" INTEGER,
    ADD COLUMN "previewFormat" TEXT,
    ADD COLUMN "renderDurationMs" INTEGER;
