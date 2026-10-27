import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { slidesRouter } from '../src/routes/slides.js';
import { recoverQueue } from '../src/lib/slides/worker.js';

const COURSE = { id: 'c1', name: 'CFA I', level: 'LEVEL1' };
const OTHER_COURSE = { id: 'c2', name: 'CFA II', level: 'LEVEL2' };
const VOLUME = { id: 'v1', name: 'Fixed Income' };
const MODULE = { id: 'm1', name: 'Bond Valuation', courseId: 'c1', volumeId: 'v1', order: 1 };
const OTHER_MODULE = { id: 'm2', name: 'Ethics', courseId: 'c2', volumeId: 'v1', order: 1 };

const PRESENTATION = {
  id: 'p1',
  title: 'Bond Valuation — Prices and Yields',
  description: null,
  courseId: 'c1',
  volumeId: 'v1',
  moduleId: 'm1',
  scope: 'LEARNING_MODULE',
  year: 2027,
  status: 'PUBLISHED',
  processingStatus: 'READY',
  slideCount: 2,
  thumbnailKey: 'presentations/p1/thumbs/thumb-0001.jpg',
  pdfKey: 'presentations/p1/presentation.pdf',
  deletedAt: null,
  fileStorageKey: 'presentations/p1/original.pptx',
  originalFilename: 'bond.pptx',
  tags: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  course: COURSE,
  volume: VOLUME,
  module: MODULE,
  topicLinks: [],
  conceptLinks: [],
  slides: [
    { id: 's1', slideNumber: 1, text: 'Modified duration measures price sensitivity.', notes: '', previewKey: 'presentations/p1/preview/slide-0001.jpg', thumbnailKey: 'presentations/p1/thumbs/thumb-0001.jpg' },
    { id: 's2', slideNumber: 2, text: 'Convexity improves the estimate.', notes: '', previewKey: 'presentations/p1/preview/slide-0002.jpg', thumbnailKey: 'presentations/p1/thumbs/thumb-0002.jpg' }
  ]
};

const DRAFT_PRESENTATION = {
  ...PRESENTATION,
  id: 'p2',
  title: 'Draft deck',
  status: 'DRAFT',
  processingStatus: 'PROCESSING',
  slides: []
};

function makePrisma() {
  const rows = [PRESENTATION, DRAFT_PRESENTATION];
  return {
    course: { findUnique: async ({ where }) => [COURSE, OTHER_COURSE].find(c => c.id === where.id) || null },
    volume: { findUnique: async ({ where }) => (where.id === VOLUME.id ? VOLUME : null) },
    module: { findUnique: async ({ where }) => [MODULE, OTHER_MODULE].find(m => m.id === where.id) || null },
    topic: { findMany: async () => [] },
    concept: { findMany: async () => [] },
    enrollment: {
      findUnique: async ({ where }) => (where.userId_courseId?.userId === 'student1' && where.userId_courseId?.courseId === 'c1'
        ? { id: 'e1' }
        : null)
    },
    courseVolume: {
      findUnique: async ({ where }) => (where.courseId_volumeId?.courseId === 'c1' && where.courseId_volumeId?.volumeId === 'v1' ? { courseId: 'c1' } : null),
      findMany: async () => [{
        courseId: 'c1', volumeId: 'v1', order: 1,
        volume: { id: 'v1', name: 'Fixed Income', description: null, modules: [{ id: 'm1', name: 'Bond Valuation', order: 1 }] }
      }]
    },
    presentation: {
      findUnique: async ({ where }) => rows.find(r => r.id === where.id) || null,
      findMany: async () => [PRESENTATION],
      count: async () => 1,
      update: async ({ where, data }) => {
        const row = rows.find(r => r.id === where.id);
        return Object.assign(row, data);
      }
    },
    presentationSlide: {
      findUnique: async ({ where }) => {
        const presentation = rows.find(r => r.id === where.presentationId_slideNumber?.presentationId);
        return presentation?.slides?.find(s => s.slideNumber === where.presentationId_slideNumber?.slideNumber) || null;
      },
      findMany: async ({ where }) => rows.find(r => r.id === where.presentationId)?.slides || [],
      count: async () => 0
    }
  };
}

function token(role = 'STUDENT', sub = role === 'ADMIN' ? 'admin1' : 'student1') {
  return jwt.sign({ sub, role }, process.env.JWT_SECRET ?? 'dev_secret');
}

async function withServer(fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/slides', slidesRouter(makePrisma()));
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

function get(base, url, role = 'STUDENT') {
  return fetch(base + url, { headers: { Authorization: `Bearer ${token(role)}` } });
}

test('student hierarchy uses the existing enrolled course and reports slide counts', async () => {
  await withServer(async (base) => {
    const res = await get(base, '/api/slides/library/hierarchy?courseId=c1');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.volumes.length, 1);
    assert.equal(body.volumes[0].name, 'Fixed Income');
    assert.equal(body.volumes[0].presentationCount, 1);
    assert.equal(body.volumes[0].modules[0].presentationCount, 1);
  });
});

test('student cannot read slides for a course they are not enrolled in', async () => {
  await withServer(async (base) => {
    const res = await get(base, '/api/slides/library/hierarchy?courseId=c2');
    assert.equal(res.status, 403);
  });
});

test('draft presentations are hidden from students but available to admins', async () => {
  await withServer(async (base) => {
    const student = await get(base, '/api/slides/presentations/p2');
    assert.equal(student.status, 404);
    const admin = await get(base, '/api/slides/presentations/p2', 'ADMIN');
    assert.equal(admin.status, 200);
    const body = await admin.json();
    assert.equal(body.presentation.status, 'DRAFT');
  });
});

test('published presentation exposes signed slide assets and viewer metadata', async () => {
  await withServer(async (base) => {
    const res = await get(base, '/api/slides/presentations/p1');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.presentation.slides.length, 2);
    assert.match(body.presentation.slides[0].previewUrl, /\/api\/slides\/assets\/p1\/preview\/1\?token=/);
    assert.equal(body.presentation.canDownloadOriginal, false);

    const badAsset = await fetch(`${base}/api/slides/assets/p1/thumbnail/1?token=invalid`);
    assert.equal(badAsset.status, 401);
  });
});

test('only processed presentations can be published', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/slides/admin/presentations/p2/publish`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token('ADMIN')}` },
      body: JSON.stringify({ published: true })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /successfully processed/i);
  });
});

test('admin update rejects a Learning Module from another course', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/slides/admin/presentations/p1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token('ADMIN')}` },
      body: JSON.stringify({
        title: 'Bond Valuation',
        courseId: 'c1',
        volumeId: 'v1',
        scope: 'LEARNING_MODULE',
        moduleId: 'm2',
        year: 2027,
        topicIds: [],
        conceptIds: []
      })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /does not belong/i);
  });
});

test('restart recovery re-queues interrupted processing jobs', async () => {
  const updates = [];
  const prisma = {
    presentation: {
      findMany: async () => [
        { id: 'p1', processingStatus: 'PROCESSING', processingAttempts: 1 },
        { id: 'p2', processingStatus: 'PENDING', processingAttempts: 5 }
      ],
      update: async ({ where, data }) => { updates.push({ id: where.id, data }); return {}; }
    }
  };
  await recoverQueue(prisma);
  assert.deepEqual(updates.find(u => u.id === 'p1')?.data, { processingStatus: 'PENDING' });
  assert.equal(updates.find(u => u.id === 'p2')?.data.processingStatus, 'FAILED');
});
