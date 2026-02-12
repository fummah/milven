-- 1) Remove existing duplicates (keep the latest row)
WITH dups AS (
  SELECT "userId","courseId", ctid,
         ROW_NUMBER() OVER (PARTITION BY "userId","courseId" ORDER BY "createdAt" DESC NULLS LAST, ctid DESC) AS rn
  FROM "Enrollment"
)
DELETE FROM "Enrollment" e
USING dups d
WHERE e.ctid = d.ctid AND d.rn > 1;

-- 2) Add unique index to prevent future duplicates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'Enrollment_userId_courseId_key'
  ) THEN
    CREATE UNIQUE INDEX "Enrollment_userId_courseId_key" ON "Enrollment"("userId","courseId");
  END IF;
END
$$;

