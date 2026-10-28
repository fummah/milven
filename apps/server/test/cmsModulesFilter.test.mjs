import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { cmsRouter } from '../src/routes/cms.js';

const MODULES = [
  { id: 'm1', name: 'Alternative Investment Performance', courseId: 'c1', volumeId: 'v-alt', level: 'LEVEL1', order: 1, volume: { id: 'v-alt', name: 'Alternative Investments' }, topics: [] },
  { id: 'm2', name: 'Fixed-Income Bond Valuation', courseId: 'c1', volumeId: 'v-fi', level: 'LEVEL1', order: 6, volume: { id: 'v-fi', name: 'Fixed Income' }, topics: [] },
  { id: 'm3', name: 'Corporate Issuers', courseId: 'c2', volumeId: 'v-alt', level: 'LEVEL2', order: 1, volume: { id: 'v-alt', name: 'Alternative Investments' }, topics: [] }
];

function makePrisma() {
  return {
    module: {
      findMany: async ({ where = {} }) => MODULES.filter(module =>
        (!where.courseId || module.courseId === where.courseId)
        && (!where.volumeId || module.volumeId === where.volumeId)
        && (!where.level || module.level === where.level)
      )
    }
  };
}

function token(role = 'ADMIN') {
  return jwt.sign({ sub: 'u1', role }, process.env.JWT_SECRET ?? 'dev_secret');
}

async function withServer(fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/cms', cmsRouter(makePrisma()));
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('learning modules endpoint filters by course and volume together', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/cms/modules?courseId=c1&volumeId=v-alt`, {
      headers: { Authorization: `Bearer ${token()}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.modules.map(module => module.id), ['m1']);
  });
});

test('learning modules endpoint never mixes modules from another volume', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/cms/modules?courseId=c1&volumeId=v-fi`, {
      headers: { Authorization: `Bearer ${token()}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.modules.map(module => module.id), ['m2']);
  });
});
