-- Add estimatedSeconds column to LearningMaterial for time estimates
ALTER TABLE "LearningMaterial" ADD COLUMN IF NOT EXISTS "estimatedSeconds" INTEGER;

