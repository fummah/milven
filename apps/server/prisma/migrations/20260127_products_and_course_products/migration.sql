-- Create enum for billing intervals
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingInterval') THEN
    CREATE TYPE "BillingInterval" AS ENUM ('ONE_TIME','MONTHLY','YEARLY');
  END IF;
END$$;

-- Create products table
CREATE TABLE IF NOT EXISTS "Product" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "priceCents" INTEGER NOT NULL,
  "interval" "BillingInterval" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Join table between courses and products
CREATE TABLE IF NOT EXISTS "CourseProduct" (
  "courseId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  CONSTRAINT "CourseProduct_pkey" PRIMARY KEY ("courseId","productId"),
  CONSTRAINT "CourseProduct_course_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CourseProduct_product_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

