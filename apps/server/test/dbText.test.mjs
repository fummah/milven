import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeDbText, sanitizeDbData } from '../src/lib/dbText.js';

test('removes actual NULL bytes and preserves ordinary text', () => {
  assert.equal(sanitizeDbText('Bond\u0000 valuation'), 'Bond valuation');
  assert.equal(sanitizeDbText('alpha beta gamma α β γ'), 'alpha beta gamma α β γ');
  assert.equal(sanitizeDbText('\\( \\frac{1}{2} \\)'), '\\( \\frac{1}{2} \\)');
  assert.equal(sanitizeDbText('Cost = $100\nNext line'), 'Cost = $100\nNext line');
  assert.equal(sanitizeDbText('literal \\0 and backslash \\\\'), 'literal \\0 and backslash \\\\');
  assert.equal(sanitizeDbText(42), 42);
});

test('recursively cleans nested question and option text only', () => {
  const input = {
    stem: 'Question\u0000 stem',
    isAiGenerated: true,
    marks: 3,
    options: [
      { text: 'Option A\u0000', isCorrect: false },
      { text: 'Option B', isCorrect: true }
    ],
    nested: { explanation: 'Answer\u0000 explanation', difficulty: 'HARD' }
  };
  const output = sanitizeDbData(input);
  assert.equal(output.stem, 'Question stem');
  assert.equal(output.options[0].text, 'Option A');
  assert.equal(output.options[1].isCorrect, true);
  assert.equal(output.nested.explanation, 'Answer explanation');
  assert.equal(output.isAiGenerated, true);
  assert.equal(output.marks, 3);
});

test('sanitizes multiple questions and preserves unrelated values', () => {
  const rows = sanitizeDbData([
    { stem: 'Q1\u0000', difficulty: 'EASY', options: [{ text: 'A\u0000', isCorrect: true }] },
    { stem: 'Q2', difficulty: 'HARD', options: [{ text: 'B', isCorrect: false }] }
  ]);
  assert.equal(rows[0].stem, 'Q1');
  assert.equal(rows[0].options[0].text, 'A');
  assert.equal(rows[0].options[0].isCorrect, true);
  assert.equal(rows[1].difficulty, 'HARD');
  assert.equal(rows[1].options[0].isCorrect, false);
});

test('logs a safe field path and NULL count without dumping content', () => {
  const logs = [];
  sanitizeDbData(
    { questions: [{ options: [{ text: 'A\u0000B\u0000C' }] }] },
    { operation: 'test.save', path: 'questions', batchId: 'batch-1', logger: { warn: line => logs.push(line) } }
  );
  assert.equal(logs.length, 1);
  assert.match(logs[0], /test.save/);
  assert.match(logs[0], /questions\[0\]\.options\[0\]\.text/);
  assert.match(logs[0], /2 NULL byte/);
  assert.match(logs[0], /batch-1/);
  assert.doesNotMatch(logs[0], /A\u0000B/);
});

const runDbIntegration = process.env.RUN_DB_INTEGRATION === '1' && Boolean(process.env.DATABASE_URL);

test('PostgreSQL accepts sanitized question and options and rolls back atomically', { skip: !runDbIntegration }, async () => {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const marker = `SANITIZE-TEST-${Date.now()}`;
  try {
    const data = sanitizeDbData({
      stem: `${marker} stem\u0000`,
      vignetteText: `Vignette\u0000 text`,
      workedSolution: `Worked\u0000 solution`,
      options: [
        { text: 'Alpha\u0000', isCorrect: false },
        { text: 'Beta', isCorrect: true }
      ]
    }, { operation: 'integration.save', path: 'questions', logger: { warn() {} } });

    let rolledBack = false;
    try {
      await prisma.$transaction(async tx => {
        const question = await tx.question.create({
          data: {
            stem: data.stem,
            vignetteText: data.vignetteText,
            workedSolution: data.workedSolution,
            type: 'MCQ',
            level: 'LEVEL1',
            difficulty: 'EASY',
            marks: 1,
            qid: marker
          }
        });
        await tx.mcqOption.createMany({
          data: data.options.map(option => ({ questionId: question.id, text: option.text, isCorrect: option.isCorrect }))
        });
        const stored = await tx.mcqOption.findMany({ where: { questionId: question.id }, orderBy: { text: 'asc' } });
        assert.deepEqual(stored.map(row => row.text), ['Alpha', 'Beta']);
        assert.equal(stored.find(row => row.isCorrect)?.text, 'Beta');
        throw new Error('ROLLBACK_TEST');
      });
    } catch (error) {
      assert.equal(error.message, 'ROLLBACK_TEST');
      rolledBack = true;
    }
    assert.equal(rolledBack, true);
    const orphan = await prisma.question.findFirst({ where: { qid: marker }, select: { id: true } });
    assert.equal(orphan, null);
  } finally {
    await prisma.$disconnect();
  }
});
