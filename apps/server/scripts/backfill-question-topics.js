/**
 * Backfill script: Populate the _QuestionToTopic implicit many-to-many join table
 * from existing Question.topicId values.
 *
 * Run after `npx prisma db push` has applied the schema changes.
 *
 * Usage:
 *   node scripts/backfill-question-topics.js
 *
 * Requires DATABASE_URL to be set in environment or .env file.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Backfilling _QuestionToTopic join table from Question.topicId...');

  // Find all questions that have a topicId set
  const questions = await prisma.question.findMany({
    where: { topicId: { not: null } },
    select: { id: true, topicId: true }
  });

  console.log(`Found ${questions.length} questions with topicId set.`);

  let connected = 0;
  let skipped = 0;
  let errors = 0;

  for (const q of questions) {
    try {
      // Connect the question to its topic via the m2m relation (idempotent)
      await prisma.question.update({
        where: { id: q.id },
        data: {
          topics: {
            connect: [{ id: q.topicId }]
          }
        }
      });
      connected++;
    } catch (e) {
      // Topic may have been deleted or other issue - skip gracefully
      if (e.code === 'P2025') {
        skipped++;
      } else {
        errors++;
        console.error(`Error connecting question ${q.id} to topic ${q.topicId}: ${e.message}`);
      }
    }
  }

  console.log(`Done. Connected: ${connected}, Skipped (missing topic): ${skipped}, Errors: ${errors}`);
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
