-- Add order column to Topic
ALTER TABLE "Topic" ADD COLUMN IF NOT EXISTS "order" INTEGER;

-- Create MaterialKind enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t WHERE t.typname = 'MaterialKind') THEN
    CREATE TYPE "MaterialKind" AS ENUM ('LINK','PDF','VIDEO','IMAGE','HTML');
  END IF;
END $$;

-- Create LearningMaterial table
CREATE TABLE IF NOT EXISTS "LearningMaterial" (
  "id" TEXT PRIMARY KEY,
  "topicId" TEXT NOT NULL,
  "kind" "MaterialKind" NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT,
  "contentHtml" TEXT,
  "imageUrl" TEXT,
  "order" INTEGER,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "LearningMaterial_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "LearningMaterial_topicId_order_idx" ON "LearningMaterial" ("topicId","order");

