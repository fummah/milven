-- Add optional start/end window for exams so they appear to students only during that time
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "startAt" TIMESTAMP(3);
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "endAt" TIMESTAMP(3);
