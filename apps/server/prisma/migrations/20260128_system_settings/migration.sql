CREATE TABLE IF NOT EXISTS "SystemSetting" (
  "id" TEXT PRIMARY KEY DEFAULT md5(random()::text),
  "key" TEXT UNIQUE NOT NULL,
  "value" JSONB,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

-- trigger to update updatedAt on change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_system_setting ON "SystemSetting";
CREATE TRIGGER set_updated_at_system_setting
BEFORE UPDATE ON "SystemSetting"
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

