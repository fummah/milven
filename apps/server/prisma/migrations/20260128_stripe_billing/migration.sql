-- Add STRIPE provider to Provider enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'Provider' AND e.enumlabel = 'STRIPE') THEN
    ALTER TYPE "Provider" ADD VALUE 'STRIPE';
  END IF;
END
$$;

-- Add Stripe columns
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "stripeProductId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "stripePriceId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "providerReference" TEXT;

