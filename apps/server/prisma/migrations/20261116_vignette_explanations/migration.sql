-- Additive fields for complete vignette / item-set review provenance.
ALTER TABLE "Question"
ADD COLUMN IF NOT EXISTS "caseStudyTitle" TEXT,
ADD COLUMN IF NOT EXISTS "sourceSetId" TEXT,
ADD COLUMN IF NOT EXISTS "correctAnswerExplanation" TEXT,
ADD COLUMN IF NOT EXISTS "incorrectOptionsExplanation" TEXT,
ADD COLUMN IF NOT EXISTS "commonMistake" TEXT,
ADD COLUMN IF NOT EXISTS "conceptsTested" TEXT,
ADD COLUMN IF NOT EXISTS "answerVerificationStatus" TEXT;

CREATE INDEX IF NOT EXISTS "Question_sourceSetId_idx" ON "Question"("sourceSetId");
