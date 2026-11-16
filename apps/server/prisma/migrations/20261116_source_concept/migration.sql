-- Preserve the original curriculum Concept text separately from verified Concept IDs.
ALTER TABLE "Question"
ADD COLUMN IF NOT EXISTS "sourceConcept" TEXT;
