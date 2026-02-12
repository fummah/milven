-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN "status" "EnrollmentStatus" NOT NULL DEFAULT 'IN_PROGRESS';
