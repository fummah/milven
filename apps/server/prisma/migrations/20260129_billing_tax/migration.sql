CREATE TABLE IF NOT EXISTS "Tax" (
  "id" TEXT PRIMARY KEY DEFAULT md5(random()::text),
  "name" TEXT NOT NULL,
  "ratePercent" DOUBLE PRECISION NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "isDefault" BOOLEAN NOT NULL DEFAULT FALSE,
  "description" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

-- ensure only one default
CREATE OR REPLACE FUNCTION ensure_single_default_tax()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."isDefault" THEN
    UPDATE "Tax" SET "isDefault" = FALSE WHERE "id" <> NEW."id";
  END IF;
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tax_single_default ON "Tax";
CREATE TRIGGER trg_tax_single_default
BEFORE INSERT OR UPDATE ON "Tax"
FOR EACH ROW EXECUTE PROCEDURE ensure_single_default_tax();

