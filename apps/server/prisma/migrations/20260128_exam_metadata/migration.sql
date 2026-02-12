-- Add lightweight exam metadata fields for admin features
ALTER TABLE "Exam"
  ADD COLUMN IF NOT EXISTS "type" TEXT,
  ADD COLUMN IF NOT EXISTS "courseId" TEXT,
  ADD COLUMN IF NOT EXISTS "topicId" TEXT,
  ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT FALSE;

-- Optional indexes for filtering
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Exam_level_idx') THEN
    CREATE INDEX "Exam_level_idx" ON "Exam"("level");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Exam_active_idx') THEN
    CREATE INDEX "Exam_active_idx" ON "Exam"("active");
  END IF;
END $$;

