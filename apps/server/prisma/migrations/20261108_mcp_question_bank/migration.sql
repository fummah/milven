-- Additive migration for MCP question-bank integration.
-- Preserve existing option order by backfilling from current row order.

ALTER TABLE "McqOption"
  ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rationale" TEXT;

ALTER TABLE "Question"
  ADD COLUMN "generationClient" TEXT,
  ADD COLUMN "generationMetadata" JSONB,
  ADD COLUMN "generationSource" TEXT,
  ADD COLUMN "calculationSteps" JSONB;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "questionId" ORDER BY "id") - 1 AS "rn"
  FROM "McqOption"
)
UPDATE "McqOption" AS option
SET "position" = ranked."rn"
FROM ranked
WHERE option."id" = ranked."id";

CREATE TABLE "McpApiToken" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "tokenPrefix" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "expiresAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "McpApiToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "McpImportBatch" (
  "id" TEXT NOT NULL,
  "externalRequestId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "sourceClient" TEXT NOT NULL,
  "sourceProvider" TEXT,
  "createdById" TEXT,
  "approvedById" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "commitStatus" TEXT NOT NULL DEFAULT 'NOT_COMMITTED',
  "academicScope" JSONB,
  "itemCount" INTEGER NOT NULL DEFAULT 0,
  "validationSummary" JSONB,
  "duplicateSummary" JSONB,
  "errors" JSONB,
  "committedCount" INTEGER NOT NULL DEFAULT 0,
  "approvedAt" TIMESTAMP(3),
  "committedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "McpImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "McpImportItem" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "externalQuestionId" TEXT,
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "questionType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "validation" JSONB,
  "duplicates" JSONB,
  "errors" JSONB,
  "committedQuestionId" TEXT,
  "committedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "McpImportItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "McpAuditLog" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorId" TEXT,
  "tokenId" TEXT,
  "batchId" TEXT,
  "detail" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "McpAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "McpAuditLog_createdAt_idx" ON "McpAuditLog"("createdAt");
CREATE INDEX "McpAuditLog_action_createdAt_idx" ON "McpAuditLog"("action", "createdAt");
CREATE INDEX "McpAuditLog_batchId_createdAt_idx" ON "McpAuditLog"("batchId", "createdAt");
CREATE UNIQUE INDEX "McpApiToken_tokenHash_key" ON "McpApiToken"("tokenHash");
CREATE INDEX "McpApiToken_userId_idx" ON "McpApiToken"("userId");
CREATE INDEX "McpApiToken_revokedAt_expiresAt_idx" ON "McpApiToken"("revokedAt", "expiresAt");
CREATE UNIQUE INDEX "McpImportBatch_idempotencyKey_key" ON "McpImportBatch"("idempotencyKey");
CREATE INDEX "McpImportBatch_status_createdAt_idx" ON "McpImportBatch"("status", "createdAt");
CREATE INDEX "McpImportBatch_createdById_createdAt_idx" ON "McpImportBatch"("createdById", "createdAt");
CREATE INDEX "McpImportItem_batchId_orderIndex_idx" ON "McpImportItem"("batchId", "orderIndex");
CREATE UNIQUE INDEX "McpImportItem_batchId_externalQuestionId_key" ON "McpImportItem"("batchId", "externalQuestionId");
CREATE INDEX "McqOption_questionId_position_idx" ON "McqOption"("questionId", "position");

ALTER TABLE "McpApiToken" ADD CONSTRAINT "McpApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "McpImportBatch" ADD CONSTRAINT "McpImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "McpImportBatch" ADD CONSTRAINT "McpImportBatch_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "McpImportItem" ADD CONSTRAINT "McpImportItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "McpImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
