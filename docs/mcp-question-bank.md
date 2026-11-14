# Milven Question Bank MCP

The Milven MCP server exposes the existing question bank and academic hierarchy through the Model Context Protocol. External AI clients generate questions themselves; Milven validates and stages them for administrator review, then commits only approved batches to the live `Question` table.

## Endpoint and transport

- Public streaming endpoint: `https://dev.milven.zbsburial.com/mcp`
- Transport: Streamable HTTP, MCP specification `2025-11-25`
- SDK: `@modelcontextprotocol/sdk` v1.32.x
- Local endpoint: `http://localhost:4000/mcp`
- Health check: `https://dev.milven.zbsburial.com/api/api/health`

The endpoint is protected. Anonymous requests receive `401` with `WWW-Authenticate: Bearer realm="milven-mcp"`.

## Authentication

### Scoped bearer tokens

Open **Admin → Courses → MCP Imports → Create MCP Token**. The secret is displayed once and stored as a SHA-256 hash.

Scopes:

- `curriculum:read` — course, volume, module, topic and concept discovery.
- `questions:read` — question search/get, schema and blueprint reads.
- `questions:validate` — read-only validation and duplicate checks.
- `questions:draft` — create/update staged review batches.
- `questions:commit` — commit an already administrator-approved batch.

Commit requires `questions:commit` **and** an administrator-approved batch. An MCP client cannot approve its own batch.

### OAuth / OIDC

For remote connectors that use OAuth, configure these API environment variables:

```text
MCP_PUBLIC_URL=https://dev.milven.zbsburial.com
MCP_OAUTH_ISSUER=https://your-identity-provider.example
MCP_OAUTH_AUDIENCE=https://dev.milven.zbsburial.com/mcp
MCP_OAUTH_JWKS_URL=https://your-identity-provider.example/.well-known/jwks.json
```

The server verifies JWT signature, issuer, audience and expiry using the configured JWKS. The token must contain an email/preferred username matching an active Milven `ADMIN` user. Scopes are read from `scope` or `scopes`; if omitted, the authenticated administrator receives the standard Milven MCP scopes.

Protected-resource metadata is available at:

```text
https://dev.milven.zbsburial.com/.well-known/oauth-protected-resource
```

Do not put tokens, client secrets, JWKS private keys or database credentials in prompts, repositories or chat messages.

## Review workflow

```text
validate -> create draft/batch -> administrator review -> approve -> commit
```

The live `Question` table does not have a publication-status field. External content is therefore stored in `McpImportBatch` / `McpImportItem` until an administrator approves it. Commit writes to the existing question bank using the shared persistence service.

Important write tools:

| Tool | Side effect |
| --- | --- |
| `milven_create_question_draft` | Creates a staged one-item review batch. |
| `milven_create_question_batch` | Creates an idempotent staged review batch. |
| `milven_update_question_draft` | Updates one staged item and revalidates it. |
| `milven_commit_approved_questions` | Writes an approved batch to the live question bank. |

Read, validation and duplicate tools never write database records.

## Tools

1. `milven_get_capabilities`
2. `milven_list_courses`
3. `milven_list_volumes`
4. `milven_list_modules`
5. `milven_list_topics`
6. `milven_list_concepts`
7. `milven_get_curriculum_context`
8. `milven_get_question_blueprint`
9. `milven_search_questions`
10. `milven_get_question`
11. `milven_validate_questions`
12. `milven_check_question_duplicates`
13. `milven_create_question_draft`
14. `milven_create_question_batch`
15. `milven_get_import_status`
16. `milven_get_question_preview`
17. `milven_commit_approved_questions`
18. `milven_update_question_draft`

Resources:

- `milven://curriculum/hierarchy`
- `milven://schema/question-v1`
- `milven://blueprint/questions`
- `milven://blueprint/difficulty`
- `milven://validation/rules`

Prompt templates:

- `generate-standalone-cfa-mcq`
- `generate-level-2-vignette-item-set`
- `generate-level-3-vignette-item-set`
- `generate-constructed-response`
- `validate-existing-question`
- `improve-distractor-quality`
- `verify-numerical-worked-solution`
- `prepare-milven-import`

## Example question payload

```json
{
  "schemaVersion": "2026-11-08",
  "externalQuestionId": "CLIENT-Q-001",
  "questionType": "MCQ",
  "courseId": "COURSE_ID",
  "volumeId": "VOLUME_ID",
  "moduleId": "MODULE_ID",
  "primaryTopicId": "TOPIC_ID",
  "additionalTopicIds": [],
  "conceptIds": ["CONCEPT_ID"],
  "difficulty": "HARD",
  "marks": 3,
  "stem": "Candidate-facing question stem.",
  "los": "Evaluate the framework.",
  "traceSection": "Asset Allocation",
  "tracePage": "p. 10",
  "keyFormulas": "\\[ E(R) = R_f + \\beta(E(R_m)-R_f) \\]",
  "workedSolution": "Step 1... Step 2... Step 3...",
  "options": [
    { "label": "A", "text": "First option", "isCorrect": false, "rationale": "Why this is a realistic error." },
    { "label": "B", "text": "Second option", "isCorrect": true, "rationale": "Why this is correct." },
    { "label": "C", "text": "Third option", "isCorrect": false, "rationale": "Why this is a realistic error." }
  ],
  "generation": {
    "source": "EXTERNAL_AI",
    "client": "Claude or ChatGPT",
    "provider": "anthropic-or-openai",
    "model": "model-name",
    "generatedAt": "2026-11-14T00:00:00.000Z",
    "promptVersion": "milven-mcp-1"
  }
}
```

For vignette item sets, use `questionType: "VIGNETTE_MCQ"`, a shared `vignetteText`, and ordered `subQuestions`. Every child must include its own stem, marks, difficulty, LOS, trace references, formulas, worked solution and concept mapping. Parent marks must equal the child total.

## Claude remote connector

1. In Claude, add a custom remote MCP connector.
2. URL: `https://dev.milven.zbsburial.com/mcp`
3. Use OAuth if your Claude workspace/OIDC provider is configured, or use the scoped bearer token where the connector supports custom authorization headers.
4. Confirm tool discovery lists the 18 `milven_*` tools.
5. Start with `milven_get_capabilities`, then discover curriculum and validate candidate questions before creating a staged batch.
6. Complete administrator approval in **Admin → Courses → MCP Imports** before asking the client to call `milven_commit_approved_questions`.

## ChatGPT custom connector

1. In a workspace that supports custom MCP connectors, create a connector using `https://dev.milven.zbsburial.com/mcp`.
2. Select OAuth if the workspace supports it and configure the Milven OAuth environment above. Otherwise use a scoped token if the workspace permits a secure custom authorization header.
3. Verify tools/resources/prompts are discovered.
4. Keep generation, validation and staging in the chat; approval and commit remain separate administrator actions.

## Local MCP inspector

```bash
npx @modelcontextprotocol/inspector
```

Use `http://localhost:4000/mcp` and set the Authorization header to `Bearer <token>`.

## Sample bank dry run

The dry-run tool never imports records. Place the supplied bank folder outside the repository and run:

```bash
cd apps/server
node src/scripts/mcpSampleDryRun.js \
  --folder "C:/path/to/cfa-level-3-bank" \
  --courseId COURSE_ID \
  --volumeId VOLUME_ID \
  --moduleId MODULE_ID \
  --topicId TOPIC_ID \
  --limit 25
```

The parser preserves set ID, volume, learning module, case-study title, vignette, questions, A/B/C options, correct answer, worked solutions, explanations, common mistakes, LOS, trace references, concepts and formulas when they are present. Missing fields are not fabricated. Academic names that do not match exactly require explicit mapping.

## Migration

The additive migration is:

```text
apps/server/prisma/migrations/20261108_mcp_question_bank/migration.sql
```

It adds:

- `McqOption.position` and `McqOption.rationale`, backfilling `position` from existing row order.
- `Question.generationSource`, `generationClient`, `generationMetadata`, `calculationSteps`.
- `McpApiToken`, `McpImportBatch`, `McpImportItem`, `McpAuditLog`.

Back up PostgreSQL before applying. The production deployment workflow runs `prisma migrate deploy` automatically.

## Existing admin AI generation

The existing AI preview/accept flow and manual question editor remain enabled. New option writes use explicit positions, and child-question updates retain their own LOS, trace, formulas, worked solution, guidelines, output and concept mapping.
