CREATE TABLE IF NOT EXISTS "MaterialProgress" (
  "id" TEXT PRIMARY KEY DEFAULT md5(random()::text),
  "userId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "kind" "MaterialKind" NOT NULL,
  "percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "timeSpentSec" INTEGER NOT NULL DEFAULT 0,
  "lastPosSec" INTEGER,
  "meta" JSONB,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "completedAt" TIMESTAMP,
  CONSTRAINT "MaterialProgress_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MaterialProgress_unique" UNIQUE ("userId","materialId")
);

CREATE TABLE IF NOT EXISTS "TopicProgress" (
  "id" TEXT PRIMARY KEY DEFAULT md5(random()::text),
  "userId" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "timeSpentSec" INTEGER NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMP,
  "gateSatisfied" BOOLEAN NOT NULL DEFAULT FALSE,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "TopicProgress_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TopicProgress_unique" UNIQUE ("userId","topicId")
);

CREATE TABLE IF NOT EXISTS "CourseProgress" (
  "id" TEXT PRIMARY KEY DEFAULT md5(random()::text),
  "userId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "timeSpentSec" INTEGER NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMP,
  "lastTopicId" TEXT,
  "lastMaterialId" TEXT,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "CourseProgress_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CourseProgress_unique" UNIQUE ("userId","courseId")
);

