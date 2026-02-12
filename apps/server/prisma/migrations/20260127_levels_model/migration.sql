-- Add NONE to CfaLevel enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'CfaLevel' AND e.enumlabel = 'NONE') THEN
    ALTER TYPE "CfaLevel" ADD VALUE 'NONE';
  END IF;
END
$$;

-- Create LevelDef table
CREATE TABLE IF NOT EXISTS "LevelDef" (
  "id" TEXT PRIMARY KEY DEFAULT md5(random()::text),
  "code" TEXT UNIQUE NOT NULL,
  "name" TEXT NOT NULL,
  "order" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Seed defaults
INSERT INTO "LevelDef" ("code","name","order","active")
VALUES
  ('NONE','None',0,TRUE),
  ('LEVEL1','Level I',1,TRUE),
  ('LEVEL2','Level II',2,TRUE),
  ('LEVEL3','Level III',3,TRUE)
ON CONFLICT ("code") DO NOTHING;

