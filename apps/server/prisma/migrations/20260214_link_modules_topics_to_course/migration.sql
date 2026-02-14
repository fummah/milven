-- Add courseId linkage to Module and Topic
ALTER TABLE "Module" ADD COLUMN IF NOT EXISTS "courseId" TEXT;
ALTER TABLE "Topic" ADD COLUMN IF NOT EXISTS "courseId" TEXT;

-- Backfill: if you have one course per level, link existing modules/topics to the latest course of that level
UPDATE "Module" m
SET "courseId" = c.id
FROM "Course" c
WHERE m."courseId" IS NULL
  AND m."level"::text = c."level"::text
  AND c.id = (
    SELECT c2.id
    FROM "Course" c2
    WHERE c2."level"::text = m."level"::text
    ORDER BY c2."createdAt" DESC
    LIMIT 1
  );

-- Prefer module->course link for topics; otherwise fall back to latest course by level
UPDATE "Topic" t
SET "courseId" = m."courseId"
FROM "Module" m
WHERE t."courseId" IS NULL
  AND t."moduleId" IS NOT NULL
  AND t."moduleId" = m."id"
  AND m."courseId" IS NOT NULL;

UPDATE "Topic" t
SET "courseId" = c.id
FROM "Course" c
WHERE t."courseId" IS NULL
  AND t."level"::text = c."level"::text
  AND c.id = (
    SELECT c2.id
    FROM "Course" c2
    WHERE c2."level"::text = t."level"::text
    ORDER BY c2."createdAt" DESC
    LIMIT 1
  );

-- Foreign keys + indexes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Module_courseId_fkey') THEN
    ALTER TABLE "Module" ADD CONSTRAINT "Module_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Topic_courseId_fkey') THEN
    ALTER TABLE "Topic" ADD CONSTRAINT "Topic_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Module_courseId_idx" ON "Module"("courseId");
CREATE INDEX IF NOT EXISTS "Topic_courseId_idx" ON "Topic"("courseId");
