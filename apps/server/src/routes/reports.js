import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';

export function reportsRouter(prisma) {
  const router = Router();

  // Overview KPI
  router.get('/overview', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const [users, students, courses, totalSubscriptions, revenue30] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'STUDENT' } }),
      prisma.course.count(),
      prisma.subscription.count(),
      (async () => {
        const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
        const payments = await prisma.paymentRecord.findMany({
          where: { provider: 'STRIPE', createdAt: { gte: since }, status: { in: ['paid', 'succeeded'] } },
          select: { amount: true }
        });
        return payments.reduce((acc, p) => acc + (p.amount ?? 0), 0);
      })()
    ]);
    const activeSubs = await prisma.subscription.count({ where: { provider: 'STRIPE', status: 'ACTIVE' } });
    res.json({ users, students, courses, totalSubscriptions, activeSubs, revenue30 });
  });

  // User signups per month (for dashboard chart)
  router.get('/signups-monthly', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const months = Math.max(1, Math.min(24, Number(req.query.months || 12)));
    const since = new Date();
    since.setMonth(since.getMonth() - (months - 1));
    since.setDate(1); since.setHours(0, 0, 0, 0);
    const users = await prisma.user.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true }
    });
    const buckets = {};
    for (let i = 0; i < months; i++) {
      const d = new Date(since);
      d.setMonth(since.getMonth() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      buckets[key] = 0;
    }
    for (const u of users) {
      const d = new Date(u.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (buckets[key] != null) buckets[key] += 1;
    }
    const labels = Object.keys(buckets).sort();
    const data = labels.map(k => buckets[k]);
    res.json({ labels, data });
  });

  // Revenue by month (last N months)
  router.get('/revenue-monthly', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const months = Math.max(1, Math.min(24, Number(req.query.months || 6)));
    const since = new Date();
    since.setMonth(since.getMonth() - (months - 1));
    since.setDate(1); since.setHours(0,0,0,0);
    const payments = await prisma.paymentRecord.findMany({
      where: { provider: 'STRIPE', createdAt: { gte: since }, status: { in: ['paid', 'succeeded'] } },
      select: { amount: true, createdAt: true }
    });
    const buckets = {};
    for (let i = 0; i < months; i++) {
      const d = new Date(since);
      d.setMonth(since.getMonth() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      buckets[key] = 0;
    }
    for (const p of payments) {
      const d = new Date(p.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (buckets[key] != null) buckets[key] += (p.amount ?? 0);
    }
    const labels = Object.keys(buckets).sort();
    const values = labels.map(k => buckets[k]);
    res.json({ labels, values });
  });

  // Paid invoices for current month (Stripe)
  router.get('/invoices/paid-month', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    try {
      const start = new Date();
      start.setDate(1); start.setHours(0,0,0,0);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0); end.setHours(23,59,59,999);
      // We cannot query Stripe by date range directly without iterating; approximate by listing recent invoices
      const stripeKey = process.env.STRIPE_SECRET_KEY || '';
      if (!stripeKey) return res.json({ count: 0, total: 0 });
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
      const invs = await stripe.invoices.list({ limit: 100, status: 'paid' });
      let count = 0; let total = 0;
      for (const inv of invs.data || []) {
        if (!(inv?.metadata && (inv.metadata.milven === '1' || inv.metadata.milven === 1))) continue;
        const created = inv.created ? new Date(inv.created * 1000) : null;
        if (created && created >= start && created <= end) {
          count += 1;
          total += inv.total || inv.amount_paid || 0;
        }
      }
      res.json({ count, total });
    } catch (e) {
      res.status(500).json({ error: 'Failed to compute paid invoices' });
    }
  });

  // Subscription status distribution
  router.get('/subscriptions/status', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const statuses = ['ACTIVE','PAST_DUE','CANCELED','INCOMPLETE'];
    const counts = {};
    await Promise.all(statuses.map(async s => { counts[s] = await prisma.subscription.count({ where: { provider: 'STRIPE', status: s } }); }));
    res.json({ counts });
  });

  // Enrollments per course (top 10)
  router.get('/enrollments/courses', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const enrolls = await prisma.enrollment.findMany({
      select: { courseId: true, course: { select: { name: true, level: true } } }
    });
    const map = new Map();
    for (const e of enrolls) {
      const key = e.courseId;
      map.set(key, { name: e.course?.name ?? 'Unknown', level: e.course?.level ?? 'NONE', count: (map.get(key)?.count ?? 0) + 1 });
    }
    const all = Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 10);
    res.json({ top: all });
  });

  // Average course progress per course (top 10)
  router.get('/progress/courses', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const cps = await prisma.courseProgress.findMany({
      select: { courseId: true, percent: true, userId: true }
    });
    const map = new Map();
    for (const c of cps) {
      const agg = map.get(c.courseId) ?? { sum: 0, n: 0 };
      agg.sum += c.percent ?? 0;
      agg.n += 1;
      map.set(c.courseId, agg);
    }
    const courseIds = Array.from(map.keys());
    const courses = await prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, name: true, level: true } });
    const byId = Object.fromEntries(courses.map(c => [c.id, c]));
    const results = courseIds.map(id => {
      const agg = map.get(id);
      const avg = agg.n ? (agg.sum / agg.n) : 0;
      const c = byId[id];
      return { name: c?.name ?? 'Unknown', level: c?.level ?? 'NONE', average: avg };
    }).sort((a, b) => b.average - a.average).slice(0, 10);
    res.json({ results });
  });

  return router;
}

