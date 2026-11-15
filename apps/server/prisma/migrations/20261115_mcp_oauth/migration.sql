-- Additive MCP OAuth 2.0 authorization server storage.

CREATE TABLE "McpOAuthClient" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "clientName" TEXT,
  "redirectUris" TEXT[],
  "grantTypes" TEXT[] DEFAULT ARRAY['authorization_code', 'refresh_token']::TEXT[],
  "responseTypes" TEXT[] DEFAULT ARRAY['code']::TEXT[],
  "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "tokenEndpointAuthMethod" TEXT NOT NULL DEFAULT 'none',
  "clientSecretHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "McpOAuthClient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "McpOAuthCode" (
  "id" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "scopes" TEXT[],
  "audience" TEXT NOT NULL,
  "codeChallenge" TEXT NOT NULL,
  "codeChallengeMethod" TEXT NOT NULL DEFAULT 'S256',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "McpOAuthCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "McpOAuthToken" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "tokenType" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "scopes" TEXT[],
  "audience" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "replacedByTokenId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "McpOAuthToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "McpOAuthClient_clientId_key" ON "McpOAuthClient"("clientId");
CREATE INDEX "McpOAuthClient_createdAt_idx" ON "McpOAuthClient"("createdAt");
CREATE UNIQUE INDEX "McpOAuthCode_codeHash_key" ON "McpOAuthCode"("codeHash");
CREATE INDEX "McpOAuthCode_clientId_createdAt_idx" ON "McpOAuthCode"("clientId", "createdAt");
CREATE INDEX "McpOAuthCode_expiresAt_idx" ON "McpOAuthCode"("expiresAt");
CREATE UNIQUE INDEX "McpOAuthToken_tokenHash_key" ON "McpOAuthToken"("tokenHash");
CREATE INDEX "McpOAuthToken_clientId_userId_idx" ON "McpOAuthToken"("clientId", "userId");
CREATE INDEX "McpOAuthToken_tokenType_expiresAt_revokedAt_idx" ON "McpOAuthToken"("tokenType", "expiresAt", "revokedAt");

ALTER TABLE "McpOAuthCode" ADD CONSTRAINT "McpOAuthCode_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "McpOAuthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "McpOAuthToken" ADD CONSTRAINT "McpOAuthToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "McpOAuthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;
