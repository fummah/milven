-- Link questions to specific exams/quizzes
CREATE TABLE IF NOT EXISTS "ExamQuestion" (
  "examId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "order" INT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "ExamQuestion_pkey" PRIMARY KEY ("examId","questionId"),
  CONSTRAINT "ExamQuestion_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExamQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ExamQuestion_examId_order_idx" ON "ExamQuestion"("examId","order");

