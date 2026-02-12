import express, { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import Stripe from 'stripe';

const stripeKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: '2023-10-16' }) : null;

export function billingRouter(prisma) {
  const router = Router();

  function intervalToStripe(interval) {
    if (interval === 'MONTHLY') return { recurring: { interval: 'month' } };
    if (interval === 'YEARLY') return { recurring: { interval: 'year' } };
    return {}; // ONE_TIME
  }

  async function ensureStripeProductAndPrice(p) {
    if (!stripe) return p;
    // Create or update product
    let sp = p.stripeProductId ? await stripe.products.retrieve(p.stripeProductId).catch(() => null) : null;
    if (!sp) {
      sp = await stripe.products.create({ name: p.name, active: p.active, description: p.description || undefined });
    } else {
      await stripe.products.update(sp.id, { name: p.name, active: p.active, description: p.description ?? undefined });
    }
    // Create price if needed (Stripe prices are immutable for amount/interval)
    let needNewPrice = !p.stripePriceId;
    if (p.stripePriceId) {
      try {
        const existing = await stripe.prices.retrieve(p.stripePriceId);
        const recurring = (p.interval === 'MONTHLY' || p.interval === 'YEARLY');
        const intervalOk = recurring ? (existing.recurring && ((p.interval === 'MONTHLY' && existing.recurring.interval === 'month') || (p.interval === 'YEARLY' && existing.recurring.interval === 'year'))) : !existing.recurring;
        const amountOk = existing.unit_amount === p.priceCents;
        const activeOk = existing.active;
        if (!(intervalOk && amountOk && activeOk)) {
          needNewPrice = true;
          // deactivate old price
          await stripe.prices.update(existing.id, { active: false });
        } else {
          // keep price but ensure nickname reflects product name for better invoice line display
          if (existing.nickname !== p.name) {
            await stripe.prices.update(existing.id, { nickname: p.name }).catch(() => {});
          }
        }
      } catch {
        needNewPrice = true;
      }
    }
    let priceId = p.stripePriceId || null;
    if (needNewPrice) {
      const base = {
        product: sp.id,
        unit_amount: p.priceCents,
        currency: 'usd',
        nickname: p.name
      };
      const created = await stripe.prices.create({
        ...base,
        ...(p.interval === 'ONE_TIME' ? {} : intervalToStripe(p.interval))
      });
      priceId = created.id;
    }
    if (sp.id !== p.stripeProductId || priceId !== p.stripePriceId) {
      const updated = await prisma.product.update({
        where: { id: p.id },
        data: { stripeProductId: sp.id, stripePriceId: priceId }
      });
      return updated;
    }
    return p;
  }

  async function ensureStripeCustomer(user) {
    if (!stripe) return null;
    if (user.stripeCustomerId) return user.stripeCustomerId;
    const customer = await stripe.customers.create({
      email: user.email,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
      metadata: { userId: user.id }
    });
    await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer.id } });
    return customer.id;
  }

  // List products with optional filters
  router.get('/products', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const q = (req.query.q ?? '').toString().trim();
    const active = req.query.hasOwnProperty('active') ? req.query.active === 'true' : undefined;
    const where = {
      AND: [
        q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] } : {},
        typeof active !== 'undefined' ? { active } : {}
      ]
    };
    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { courseLinks: { include: { course: { select: { id: true, name: true, level: true } } } } }
    });
    const normalized = products.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      priceCents: p.priceCents ?? p.priceC, // compatibility with migration column name
      interval: p.interval,
      active: p.active,
      courses: (p.courseLinks || []).map(l => l.course)
    }));
    res.json({ products: normalized });
  });

  // Create product and link to courses (also create Stripe product/price)
  router.post('/products', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const { name, description, priceCents, interval, active = true, courseIds = [] } = req.body || {};
    if (!name || typeof priceCents !== 'number' || !interval) {
      return res.status(400).json({ error: 'name, priceCents and interval are required' });
    }
    let product = await prisma.product.create({
      data: {
        name,
        description: description ?? null,
        priceCents,
        interval,
        active: !!active,
        courseLinks: {
          create: (Array.isArray(courseIds) ? courseIds : []).map((id) => ({ course: { connect: { id } } }))
        }
      },
      include: { courseLinks: { include: { course: true } } }
    });
    try {
      product = await ensureStripeProductAndPrice(product);
    } catch (e) {
      // Log but don't fail creation
      console.warn('[billing] Stripe sync create failed:', e?.message ?? e);
    }
    res.status(201).json({ product });
  });

  // Update product and reset course links (sync to Stripe)
  router.put('/products/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    const { name, description, priceCents, interval, active, courseIds } = req.body || {};
    const data = {};
    if (typeof name !== 'undefined') data.name = name;
    if (typeof description !== 'undefined') data.description = description;
    if (typeof priceCents === 'number') data.priceCents = priceCents;
    if (typeof interval !== 'undefined') data.interval = interval;
    if (typeof active !== 'undefined') data.active = !!active;

    let updated = await prisma.$transaction(async (tx) => {
      const p = await tx.product.update({ where: { id }, data });
      if (Array.isArray(courseIds)) {
        await tx.courseProduct.deleteMany({ where: { productId: id } });
        await tx.courseProduct.createMany({ data: courseIds.map(cId => ({ courseId: cId, productId: id })) });
      }
      return tx.product.findUnique({ where: { id }, include: { courseLinks: { include: { course: true } } } });
    });
    try {
      updated = await ensureStripeProductAndPrice(updated);
    } catch (e) {
      console.warn('[billing] Stripe sync update failed:', e?.message ?? e);
    }
    res.json({ product: updated });
  });

  // Delete product (also removes links via cascade)
  router.delete('/products/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    await prisma.product.delete({ where: { id } });
    res.json({ ok: true });
  });

  // Create Stripe Checkout Session for a product
  router.post('/checkout-session', requireAuth(), async (req, res) => {
    try {
      if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
      const { productId, successUrl, cancelUrl, mode } = req.body || {};
      let product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) return res.status(400).json({ error: 'Invalid product' });
      try {
        product = await ensureStripeProductAndPrice(product);
      } catch (e) {
        return res.status(500).json({ error: 'Stripe sync failed' });
      }
      if (!product.stripePriceId) return res.status(400).json({ error: 'Product missing Stripe price' });
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      const customerId = await ensureStripeCustomer(user);
      const isRecurring = product.interval === 'MONTHLY' || product.interval === 'YEARLY';
      const session = await stripe.checkout.sessions.create({
        mode: mode ?? (isRecurring ? 'subscription' : 'payment'),
        customer: customerId,
        line_items: [{ price: product.stripePriceId, quantity: 1 }],
        allow_promotion_codes: true,
        success_url: successUrl || 'http://localhost:5173/billing/success',
        cancel_url: cancelUrl || 'http://localhost:5173/billing/cancel',
        metadata: { userId: user.id, productId: product.id, milven: '1' }
      });
      res.json({ id: session.id, url: session.url });
    } catch (err) {
      const msg = err?.message || 'Stripe error';
      res.status(400).json({ error: msg });
    }
  });

  // After Stripe redirect: process completed checkout by session_id (enrollment + subscription + invoice)
  // Use this when webhook is not reachable (e.g. local dev) or as backup
  router.post('/checkout-success', requireAuth(), async (req, res) => {
    try {
      if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
      const { session_id } = req.body || {};
      if (!session_id) return res.status(400).json({ error: 'session_id required' });
      const session = await stripe.checkout.sessions.retrieve(String(session_id), {
        expand: ['customer', 'customer_details']
      });
      if (session.payment_status !== 'paid' && session.status !== 'complete') {
        return res.status(400).json({ error: 'Checkout not paid yet' });
      }
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
      const email = session.customer_details?.email || session.customer_email;
      let user = customerId ? await prisma.user.findFirst({ where: { stripeCustomerId: customerId } }) : null;
      if (!user && session.metadata?.userId) user = await prisma.user.findUnique({ where: { id: session.metadata.userId } });
      if (!user && email) user = await prisma.user.findUnique({ where: { email } });
      if (!user) return res.status(400).json({ error: 'User not found for this checkout' });
      if (user.id !== req.user.id) return res.status(403).json({ error: 'Checkout does not belong to this user' });
      if (!user.stripeCustomerId && customerId) {
        await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
      }
      const productId = session.metadata?.productId || null;
      const custId = typeof customerId === 'string' ? customerId : customerId?.id;

      // Enroll student in linked courses for both payment and subscription (so subscription is recorded)
      if (productId) {
        const links = await prisma.courseProduct.findMany({ where: { productId: String(productId) } });
        for (const link of links) {
          try {
            const existing = await prisma.enrollment.findFirst({
              where: { userId: user.id, courseId: link.courseId }
            });
            if (!existing) {
              await prisma.enrollment.create({
                data: { userId: user.id, courseId: link.courseId }
              });
            }
          } catch (e) {
            console.warn('[billing] checkout-success enroll:', e?.message ?? e);
          }
        }
      }

      // Create paid invoice for one-time payment (subscription first invoice is created by Stripe)
      if (session.mode === 'payment' && productId && custId) {
        try {
          const prod = await prisma.product.findUnique({ where: { id: String(productId) } });
          if (prod) {
            const synced = await ensureStripeProductAndPrice(prod);
            if (synced?.stripePriceId) {
              const inv = await stripe.invoices.create({
                customer: custId,
                collection_method: 'send_invoice',
                days_until_due: 0,
                metadata: {
                  milven: '1',
                  purchase: '1',
                  productId: String(prod.id),
                  checkoutSession: String(session.id),
                  userId: user.id
                }
              });
              await stripe.invoiceItems.create({
                customer: custId,
                price: synced.stripePriceId,
                invoice: inv.id,
                quantity: 1,
                description: prod.description || prod.name,
                metadata: { milven: '1', type: 'purchase', productId: String(prod.id) }
              });
              const finalized = await stripe.invoices.finalizeInvoice(inv.id);
              await stripe.invoices.pay(finalized.id, { paid_out_of_band: true });
            }
          }
        } catch (e) {
          console.warn('[billing] checkout-success invoice:', e?.message ?? e);
        }
      }
      const subId = session.subscription || null;
      let planValue = null;
      if (productId) {
        const prod = await prisma.product.findUnique({ where: { id: productId } }).catch(() => null);
        if (prod) planValue = prod.name;
      }
      await prisma.subscription.upsert({
        where: { userId_provider: { userId: user.id, provider: 'STRIPE' } },
        update: { status: 'ACTIVE', plan: planValue ?? 'PRODUCT', currency: 'usd', providerReference: subId ?? undefined },
        create: { userId: user.id, provider: 'STRIPE', status: 'ACTIVE', plan: planValue ?? 'PRODUCT', currency: 'usd', providerReference: subId ?? undefined }
      });
      return res.json({ ok: true, enrolled: true });
    } catch (err) {
      console.error('[billing] checkout-success error:', err?.message ?? err);
      return res.status(400).json({ error: err?.message || 'Failed to process checkout' });
    }
  });

  // List one-time purchases (Checkout sessions in payment mode)
  router.get('/purchases', requireAuth(), async (req, res) => {
    try {
      if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
      const isAdmin = req.user.role === 'ADMIN';
      const requestedUserId = req.query.userId ? String(req.query.userId) : null;
      let customerId = null;
      // Resolve customerId when a specific user is requested (or non-admin)
      if (requestedUserId || !isAdmin) {
        const userId = requestedUserId || req.user.id;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user?.stripeCustomerId) return res.json({ purchases: [] });
        customerId = user.stripeCustomerId;
      }
      // 1) Checkout Sessions (payment mode) - no deep expansions
      const sessions = await stripe.checkout.sessions.list(
        customerId ? { customer: customerId, limit: 50 } : { limit: 50 }
      );
      const sessFiltered = (sessions.data || []).filter((s) =>
        s.mode === 'payment' && (s.status === 'complete' || s.payment_status === 'paid')
      );
      // Fetch minimal line items per session (no product expansion)
      const sessWithLines = await Promise.all(
        sessFiltered.map(async (s) => {
          try {
            const liRes = await stripe.checkout.sessions.listLineItems(s.id, { limit: 10 });
            return { session: s, items: liRes.data || [] };
          } catch {
            return { session: s, items: [] };
          }
        })
      );
      const sessProdIds = Array.from(
        new Set(
          sessWithLines.flatMap((sl) =>
            (sl.items || [])
              .map((li) => li.price?.product)
              .filter(Boolean)
              .map((p) => (typeof p === 'string' ? p : p.id))
          )
        )
      );
      // Collect all customerIds from sessions to map back to users
      const sessionCustomerIds = Array.from(
        new Set(sessWithLines.map(sl => (typeof sl.session.customer === 'string' ? sl.session.customer : sl.session.customer?.id)).filter(Boolean))
      );
      let localMap = {};
      if (sessProdIds.length) {
        const locals = await prisma.product.findMany({
          where: { stripeProductId: { in: sessProdIds } },
          select: { stripeProductId: true, name: true }
        });
        localMap = Object.fromEntries(locals.map((p) => [p.stripeProductId, p.name]));
      }
      // Build map customerId -> user
      let userByCustomer = {};
      if (sessionCustomerIds.length) {
        const ulist = await prisma.user.findMany({
          where: { stripeCustomerId: { in: sessionCustomerIds } },
          select: { id: true, email: true, stripeCustomerId: true }
        });
        userByCustomer = Object.fromEntries(ulist.map(u => [u.stripeCustomerId, { id: u.id, email: u.email }]));
      }
      let purchases = sessWithLines.map(({ session: s, items }) => {
        const li = items[0];
        const prod = li?.price?.product;
        const prodId = typeof prod === 'string' ? prod : prod?.id;
        const productName = (prodId && localMap[prodId]) || li?.price?.nickname || li?.description || undefined;
        const custId = typeof s.customer === 'string' ? s.customer : s.customer?.id;
        const u = custId ? userByCustomer[custId] : null;
        return {
          id: s.id,
          amount_total: s.amount_total,
          currency: s.currency,
          payment_status: s.payment_status,
          status: s.status,
          created: s.created,
          url: s.url,
          productName,
          userId: u?.id || null,
          userEmail: u?.email || null
        };
      });
      // 2) Paid invoices that are one-time purchases only (exclude subscription/recurring invoices)
      try {
        const invs = await stripe.invoices.list(
          customerId ? { customer: customerId, limit: 50, status: 'paid' } : { limit: 50, status: 'paid' }
        );
        const purchaseInvs = (invs.data || []).filter(i =>
          i?.metadata?.purchase === '1' || i?.metadata?.purchase === 1
        );
        // For each invoice, retrieve lines only (no product expansion)
        const invItems = await Promise.all(purchaseInvs.map(async (inv) => {
          let lines = inv.lines?.data;
          if (!lines) {
            try {
              const detail = await stripe.invoices.retrieve(inv.id, { expand: ['lines'] });
              lines = detail.lines?.data || [];
            } catch {
              lines = [];
            }
          }
          const li = (lines || [])[0];
          const prodId = typeof li?.price?.product === 'string' ? li.price.product : li?.price?.product?.id;
          const productName = (prodId && localMap[prodId]) || li?.price?.nickname || li?.description || undefined;
          const custId = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id;
          let u = null;
          if (custId && !userByCustomer[custId]) {
            const one = await prisma.user.findFirst({ where: { stripeCustomerId: custId }, select: { id: true, email: true } });
            if (one) userByCustomer[custId] = { id: one.id, email: one.email };
          }
          u = custId ? userByCustomer[custId] : null;
          return {
            id: inv.id,
            amount_total: inv.total ?? inv.amount_paid ?? 0,
            currency: inv.currency,
            payment_status: 'paid',
            status: 'complete',
            created: inv.created,
            url: inv.hosted_invoice_url,
            productName,
            userId: u?.id || null,
            userEmail: u?.email || null
          };
        }));
        purchases = [...purchases, ...invItems];
      } catch (e) {
        console.warn('[billing] purchases invoices list failed:', e?.message ?? e);
      }
      // For non-admin (student billing): only return this user's purchases, not all
      if (!isAdmin) {
        purchases = (purchases || []).filter(p => p.userId === req.user.id);
      }
      return res.json({ purchases });
    } catch (err) {
      console.error('[billing] purchases error:', err);
      return res.status(500).json({ error: 'Failed to list purchases' });
    }
  });

  // TAXES: list, create, update, delete
  router.get('/taxes', requireAuth(), requireRole('ADMIN'), async (_req, res) => {
    const taxes = await prisma.tax.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
    res.json({ taxes });
  });
  router.post('/taxes', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const { name, ratePercent, active = true, isDefault = false, description } = req.body || {};
    if (!name || typeof ratePercent !== 'number') return res.status(400).json({ error: 'name and ratePercent required' });
    const tax = await prisma.tax.create({ data: { name, ratePercent, active: !!active, isDefault: !!isDefault, description: description ?? null } });
    res.status(201).json({ tax });
  });
  router.put('/taxes/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    const { name, ratePercent, active, isDefault, description } = req.body || {};
    const data = {};
    if (typeof name !== 'undefined') data.name = name;
    if (typeof ratePercent === 'number') data.ratePercent = ratePercent;
    if (typeof active !== 'undefined') data.active = !!active;
    if (typeof isDefault !== 'undefined') data.isDefault = !!isDefault;
    if (typeof description !== 'undefined') data.description = description;
    const tax = await prisma.tax.update({ where: { id }, data });
    res.json({ tax });
  });
  router.delete('/taxes/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    await prisma.tax.delete({ where: { id } });
    res.json({ ok: true });
  });

  // Create Stripe Billing Portal session
  router.post('/portal-session', requireAuth(), async (req, res) => {
    if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const customerId = await ensureStripeCustomer(user);
    const returnUrl = (req.body && req.body.returnUrl) || 'http://localhost:5173/account/billing';
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl
    });
    res.json({ url: session.url });
  });

  // List subscriptions for current user, specific user (admin), or all (admin without userId)
  router.get('/subscriptions', requireAuth(), async (req, res) => {
    try {
      if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
      const isAdmin = req.user.role === 'ADMIN';
      const requestedUserId = req.query.userId ? String(req.query.userId) : null;
      let subs;
      if (requestedUserId || !isAdmin) {
        const userId = requestedUserId || req.user.id;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user?.stripeCustomerId) {
          subs = { data: [] };
        } else {
          subs = await stripe.subscriptions.list({
            customer: user.stripeCustomerId,
            status: 'all',
            expand: ['data.items.data.price'] // avoid product deep expansion
          });
        }
      } else {
        // Admin without specific user -> list account-wide subscriptions
        subs = await stripe.subscriptions.list({
          limit: 50,
          status: 'all',
          expand: ['data.items.data.price'] // shallow expand
        });
      }
      // Map product names via local DB using stripeProductId
      const stripeProductIds = Array.from(new Set((subs.data || []).flatMap(s =>
        (s.items?.data || []).map(i => {
          const p = i.price?.product;
          return typeof p === 'string' ? p : p?.id;
        }).filter(Boolean)
      )));
      let byStripeId = {};
      if (stripeProductIds.length) {
        const localProducts = await prisma.product.findMany({
          where: { stripeProductId: { in: stripeProductIds } },
          select: { id: true, name: true, stripeProductId: true }
        });
        byStripeId = Object.fromEntries(localProducts.map(p => [p.stripeProductId, p]));
      }
      // Map local product id -> linked courses
      const localProductIds = Object.values(byStripeId).map(p => p.id);
      let coursesByLocalProduct = {};
      if (localProductIds.length) {
        const links = await prisma.courseProduct.findMany({
          where: { productId: { in: localProductIds } },
          include: { course: { select: { id: true, name: true, level: true, active: true } } }
        });
        for (const l of links) {
          if (!coursesByLocalProduct[l.productId]) coursesByLocalProduct[l.productId] = [];
          coursesByLocalProduct[l.productId].push(l.course);
        }
      }
      // Map customer -> user email for display
      let userByCustomer = {};
      const customerIds = Array.from(new Set((subs.data || []).map(s => (typeof s.customer === 'string' ? s.customer : s.customer?.id)).filter(Boolean)));
      if (customerIds.length) {
        const users = await prisma.user.findMany({
          where: { stripeCustomerId: { in: customerIds } },
          select: { id: true, email: true, stripeCustomerId: true }
        });
        userByCustomer = Object.fromEntries(users.map(u => [u.stripeCustomerId, { id: u.id, email: u.email }]));
      }
      const mapped = (subs.data || []).map(s => {
        const item = s.items?.data?.[0];
        const prod = item?.price?.product;
        const stripeProdId = typeof prod === 'string' ? prod : prod?.id;
        const lp = stripeProdId ? byStripeId[stripeProdId] : null;
        const custId = typeof s.customer === 'string' ? s.customer : s.customer?.id;
        const u = custId ? userByCustomer[custId] : null;
        return {
          ...s,
          productName: lp?.name || item?.price?.nickname || null,
          localProductId: lp?.id || null,
          courses: lp?.id ? (coursesByLocalProduct[lp.id] || []) : [],
          userEmail: u?.email || null,
          userId: u?.id || null
        };
      });

      // Include prisma Subscription records (e.g. one-time course purchases) so they appear under Subscriptions
      const stripeSubIds = new Set((subs.data || []).map(s => s.id));
      const prismaWhere = { provider: 'STRIPE', status: { in: ['ACTIVE', 'PAST_DUE'] } };
      if (requestedUserId || !isAdmin) {
        const uid = requestedUserId || req.user.id;
        prismaWhere.userId = uid;
      }
      const prismaSubs = await prisma.subscription.findMany({
        where: prismaWhere,
        include: { user: { select: { id: true, email: true } } }
      });
      const planNames = [...new Set(prismaSubs.map(ps => ps.plan).filter(Boolean))];
      let productByPlanName = {};
      if (planNames.length) {
        const prods = await prisma.product.findMany({
          where: { name: { in: planNames } },
          select: { id: true, name: true }
        });
        productByPlanName = Object.fromEntries(prods.map(p => [p.name, p]));
      }
      const localProductIdsForPrisma = Object.values(productByPlanName).map(p => p.id);
      let coursesByProductForPrisma = {};
      if (localProductIdsForPrisma.length) {
        const links = await prisma.courseProduct.findMany({
          where: { productId: { in: localProductIdsForPrisma } },
          include: { course: { select: { id: true, name: true, level: true, active: true } } }
        });
        for (const l of links) {
          if (!coursesByProductForPrisma[l.productId]) coursesByProductForPrisma[l.productId] = [];
          coursesByProductForPrisma[l.productId].push(l.course);
        }
      }
      for (const ps of prismaSubs) {
        if (ps.providerReference && stripeSubIds.has(ps.providerReference)) continue;
        const lp = ps.plan ? productByPlanName[ps.plan] : null;
        const courses = lp?.id ? (coursesByProductForPrisma[lp.id] || []) : [];
        mapped.push({
          id: ps.providerReference || ps.id,
          _prismaId: ps.id,
          status: (ps.status === 'ACTIVE' || ps.status === 'PAST_DUE') ? (ps.status || 'ACTIVE') : 'ACTIVE',
          productName: ps.plan || 'Course purchase',
          localProductId: lp?.id || null,
          courses,
          userEmail: ps.user?.email || null,
          userId: ps.userId
        });
      }

      // For student viewing own list: also show courses from enrollments that have a linked product (paid courses)
      // so Subscribed Courses appears as soon as enrollment exists (e.g. after Stripe checkout, even if webhook was delayed)
      if (requestedUserId || !isAdmin) {
        const uid = requestedUserId || req.user.id;
        const enrollmentsWithProduct = await prisma.enrollment.findMany({
          where: { userId: uid },
          include: {
            course: { include: { courseProducts: true } }
          }
        });
        const courseIdsAlreadyInSubs = new Set(mapped.flatMap(m => (m.courses || []).map(c => c.id)));
        for (const en of enrollmentsWithProduct) {
          if (!en.course || (en.course.courseProducts || []).length === 0) continue;
          if (courseIdsAlreadyInSubs.has(en.course.id)) continue;
          mapped.push({
            id: `enroll-${en.id}`,
            _fromEnrollment: true,
            status: 'ACTIVE',
            productName: en.course.name,
            localProductId: null,
            courses: [{ id: en.course.id, name: en.course.name, level: en.course.level, active: en.course.active }],
            userEmail: null,
            userId: uid
          });
          courseIdsAlreadyInSubs.add(en.course.id);
        }
      }

      // For non-admin (e.g. student dashboard): only return subscriptions belonging to the current user
      const subscriptions = (requestedUserId || !isAdmin)
        ? mapped.filter(m => m.userId === req.user.id)
        : mapped;

      res.json({ subscriptions });
    } catch (err) {
      console.error('[billing] subscriptions.list error:', err);
      res.status(500).json({ error: 'Failed to list subscriptions' });
    }
  });

  // List invoices for current user or a specified user (admin), with download links
  router.get('/invoices', requireAuth(), async (req, res) => {
    try {
      if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
      let userId = req.user.id;
      const requestedUserId = req.query.userId?.toString();
      const status = req.query.status ? String(req.query.status) : undefined; // 'open' | 'paid' | 'void' | 'uncollectible' | 'draft'
      const q = req.query.q ? String(req.query.q).toLowerCase().trim() : '';
      const isAdmin = req.user.role === 'ADMIN';
      // Admin without userId -> list account invoices (all customers)
      const listParams = {
        limit: 50,
        // Expand only to allowed depth; expand price to get price info, not product (too deep)
        expand: ['data.customer', 'data.lines', 'data.lines.data.price']
      };
      if (status) {
        // @ts-ignore
        listParams.status = status;
      }
      let stripeInvoices;
      if (isAdmin && !requestedUserId) {
        stripeInvoices = await stripe.invoices.list(listParams);
      } else {
        if (requestedUserId && isAdmin) userId = requestedUserId;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user?.stripeCustomerId) return res.json({ invoices: [] });
        stripeInvoices = await stripe.invoices.list({ ...listParams, customer: user.stripeCustomerId });
      }
      let data = Array.isArray(stripeInvoices?.data) ? stripeInvoices.data : [];
      // Keep only invoices created by this system (tagged via metadata.milven)
      data = data.filter(inv => inv?.metadata && (inv.metadata.milven === '1' || inv.metadata.milven === 1));
      // Map Stripe product IDs from line items to local product names
      const stripeProdIds = Array.from(new Set(
        data.flatMap(inv =>
          (inv.lines?.data || []).map(li => {
            const prod = li.price?.product;
            return typeof prod === 'string' ? prod : (prod?.id);
          }).filter(Boolean)
        )
      ));
      let localMap = {};
      if (stripeProdIds.length) {
        const locals = await prisma.product.findMany({
          where: { stripeProductId: { in: stripeProdIds } },
          select: { stripeProductId: true, name: true }
        });
        localMap = Object.fromEntries(locals.map(p => [p.stripeProductId, p.name]));
      }
      let mapped = data.map(inv => ({
        id: inv.id,
        number: inv.number,
        total: inv.total ?? inv.amount_due ?? 0,
        amountDue: inv.amount_due ?? 0,
        amountPaid: inv.amount_paid ?? 0,
        amountRemaining: inv.amount_remaining ?? Math.max(0, (inv.amount_due ?? 0) - (inv.amount_paid ?? 0)),
        currency: inv.currency,
        status: inv.status,
        displayStatus: (() => {
          if (inv.status === 'paid') return 'Paid';
          if (inv.status === 'void') return 'Cancelled';
          const paid = inv.amount_paid || 0;
          const remaining = inv.amount_remaining || 0;
          if (inv.status === 'open') {
            if (paid > 0 && remaining > 0) return 'Pending';
            if (paid === 0) return 'Unpaid';
            return 'Pending';
          }
          if (inv.status === 'uncollectible') return 'Unpaid';
          return 'Pending';
        })(),
        hostedInvoiceUrl: inv.hosted_invoice_url,
        invoicePdf: inv.invoice_pdf,
        dueDate: inv.due_date ? new Date(inv.due_date * 1000).toISOString() : null,
        created: inv.created ? new Date(inv.created * 1000).toISOString() : null,
        customerEmail: inv.customer_email || (typeof inv.customer !== 'string' ? inv.customer?.email : undefined),
        lines: (inv.lines?.data || []).map(li => {
          const prod = li.price?.product;
          const prodId = typeof prod === 'string' ? prod : (prod?.id);
          const productName = (prodId && localMap[prodId]) || (typeof prod !== 'string' ? prod?.name : undefined) || li.price?.nickname || undefined;
          const lineAmount = (typeof li.amount_total === 'number' ? li.amount_total
                            : typeof li.amount === 'number' ? li.amount
                            : typeof li.amount_excluding_tax === 'number' ? li.amount_excluding_tax
                            : typeof li.amount_subtotal === 'number' ? li.amount_subtotal
                            : (li.price?.unit_amount ? (li.price.unit_amount * (li.quantity || 1)) : 0));
          return {
            id: li.id,
            description: li.description || undefined,
            productName,
            priceNickname: li.price?.nickname,
            unitAmount: li.price?.unit_amount || null,
            amount: lineAmount,
            currency: li.currency,
            quantity: li.quantity,
          };
        })
      }));
      // Apply free-text filter if provided
      if (q) {
        mapped = mapped.filter(m =>
          (m.number && m.number.toLowerCase().includes(q)) ||
          (m.customerEmail && m.customerEmail.toLowerCase().includes(q)) ||
          (m.lines || []).some(li =>
            (li.productName && li.productName.toLowerCase().includes(q)) ||
            (li.description && li.description.toLowerCase().includes(q))
          )
        );
      }
      res.json({ invoices: mapped });
    } catch (err) {
      console.error('[billing] invoices.list error:', err);
      const msg = err?.message || 'Failed to list invoices';
      res.status(500).json({ error: msg });
    }
  });

  // ADMIN: Create one-off invoice for a user with one or more products
  router.post('/invoices', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
    const { userId, productIds = [], finalize = true, send = true, taxId, adminPurchase = false } = req.body || {};
    if (!userId || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ error: 'userId and productIds required' });
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const customerId = await ensureStripeCustomer(user);
    let products = await prisma.product.findMany({ where: { id: { in: productIds } } });
    if (!products.length) return res.status(400).json({ error: 'No valid products' });
    // Create a draft invoice first so we can attach lines explicitly
    let invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: 7,
      metadata: { milven: '1', ...(adminPurchase ? { purchase: '1' } : {}) }
    });
    // Sync all products to Stripe and create invoice items attached to this invoice
    let subtotalCents = 0;
    for (let p of products) {
      try {
        p = await ensureStripeProductAndPrice(p);
      } catch (e) {
        return res.status(500).json({ error: `Stripe sync failed for product ${p.id}` });
      }
      if (!p.stripePriceId) {
        return res.status(400).json({ error: `Product ${p.id} missing Stripe price` });
      }
      subtotalCents += (p.priceCents || 0);
      await stripe.invoiceItems.create({
        customer: customerId,
        price: p.stripePriceId,
        invoice: invoice.id,
        quantity: 1,
        description: p.description || p.name,
        metadata: { milven: '1', productId: p.id }
      });
    }
    // Apply tax if provided or default tax exists
    let taxRow = null;
    if (taxId) {
      taxRow = await prisma.tax.findUnique({ where: { id: String(taxId) } });
    } else {
      taxRow = await prisma.tax.findFirst({ where: { active: true, isDefault: true } });
    }
    if (taxRow && taxRow.active && typeof taxRow.ratePercent === 'number' && subtotalCents > 0) {
      const taxAmount = Math.round(subtotalCents * (taxRow.ratePercent / 100));
      if (taxAmount > 0) {
        await stripe.invoiceItems.create({
          customer: customerId,
          invoice: invoice.id,
          amount: taxAmount,
          currency: 'usd',
          description: `Tax (${taxRow.name} ${taxRow.ratePercent}%)`,
          metadata: { milven: '1', type: 'tax', taxId: taxRow.id }
        });
      }
    }
    if (finalize) {
      invoice = await stripe.invoices.finalizeInvoice(invoice.id);
      if (send) {
        await stripe.invoices.sendInvoice(invoice.id);
      }
    }
    res.status(201).json({ invoice });
  });

  // ADMIN: Update an invoice (void, mark uncollectible, send)
  router.put('/invoices/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    try {
      if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
      const { action, dueDate } = req.body || {};
      const id = req.params.id;
      let invoice = await stripe.invoices.retrieve(id);
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      if (dueDate) {
        const ts = Math.floor(new Date(dueDate).getTime() / 1000);
        invoice = await stripe.invoices.update(id, {
          due_date: ts,
          collection_method: 'send_invoice'
        });
        return res.json({ invoice });
      }
      if (action === 'void') {
        if (invoice.status === 'paid') {
          return res.status(400).json({ error: 'Paid invoices cannot be voided' });
        }
        invoice = await stripe.invoices.voidInvoice(id);
      } else if (action === 'mark_uncollectible') {
        if (invoice.status !== 'open') {
          return res.status(400).json({ error: 'Only open invoices can be marked uncollectible' });
        }
        invoice = await stripe.invoices.markUncollectible(id);
      } else if (action === 'finalize') {
        if (invoice.status !== 'draft') return res.status(400).json({ error: 'Only draft invoices can be finalized' });
        invoice = await stripe.invoices.finalizeInvoice(id);
      } else if (action === 'pay') {
        // Mark paid out-of-band (no payment method charge) for admin adjustments
        if (invoice.status === 'draft') {
          invoice = await stripe.invoices.finalizeInvoice(id);
        }
        if (invoice.status !== 'open') {
          return res.status(400).json({ error: "Invoice isn't open; cannot mark paid" });
        }
        invoice = await stripe.invoices.pay(id, { paid_out_of_band: true });
        // On marking paid, auto-enroll user into linked courses for product line items
        try {
          const inv = await stripe.invoices.retrieve(id, { expand: ['customer', 'lines', 'lines.data.price'] });
          const customerId = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id;
          if (customerId) {
            const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
            if (user) {
              const prodIds = (inv.lines?.data || [])
                .map(li => {
                  const p = li.price?.product;
                  return typeof p === 'string' ? p : p?.id;
                })
                .filter(Boolean);
              if (prodIds.length) {
                const locals = await prisma.product.findMany({ where: { stripeProductId: { in: prodIds } }, select: { id: true } });
                for (const lp of locals) {
                  const links = await prisma.courseProduct.findMany({ where: { productId: lp.id }, select: { courseId: true } });
                  for (const link of links) {
                    try {
                      const existing = await prisma.enrollment.findFirst({
                        where: { userId: user.id, courseId: link.courseId }
                      });
                      if (!existing) {
                        await prisma.enrollment.create({
                          data: { userId: user.id, courseId: link.courseId }
                        });
                      }
                    } catch (e) {
                      console.warn('[billing] invoice mark-paid enroll:', e?.message ?? e);
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn('[billing] enroll on paid invoice failed:', e?.message ?? e);
        }
      } else if (action === 'send') {
        // send requires finalized invoice
        if (invoice.status === 'draft') {
          invoice = await stripe.invoices.finalizeInvoice(id);
        }
        if (invoice.status !== 'open') {
          return res.status(400).json({ error: "Invoice isn't open; cannot send" });
        }
        invoice = await stripe.invoices.sendInvoice(id);
      } else {
        return res.status(400).json({ error: 'Unsupported action' });
      }
      res.json({ invoice });
    } catch (err) {
      console.error('[billing] update invoice error:', err);
      const msg = err?.message || 'Failed to update invoice';
      res.status(400).json({ error: msg });
    }
  });

  // ADMIN: Delete invoice (only draft)
  router.delete('/invoices/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
    const id = req.params.id;
    const inv = await stripe.invoices.retrieve(id);
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    if (inv.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft invoices can be deleted' });
    }
    await stripe.invoices.del(id);
    return res.json({ ok: true });
  });
  // ADMIN: Get invoice detail
  router.get('/invoices/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
    const id = req.params.id;
    const inv = await stripe.invoices.retrieve(id, { expand: ['customer', 'lines.data.price'] });
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    const mapped = {
      id: inv.id,
      number: inv.number,
      total: inv.total ?? inv.amount_due ?? 0,
      amountDue: inv.amount_due ?? 0,
      amountPaid: inv.amount_paid ?? 0,
      amountRemaining: inv.amount_remaining ?? Math.max(0, (inv.amount_due ?? 0) - (inv.amount_paid ?? 0)),
      currency: inv.currency,
      status: inv.status,
      hostedInvoiceUrl: inv.hosted_invoice_url,
      invoicePdf: inv.invoice_pdf,
      dueDate: inv.due_date ? new Date(inv.due_date * 1000).toISOString() : null,
      created: inv.created ? new Date(inv.created * 1000).toISOString() : null,
      customerEmail: inv.customer_email || (typeof inv.customer !== 'string' ? inv.customer?.email : undefined),
      lines: (inv.lines?.data || []).map(li => {
        const lineAmount = (typeof li.amount_total === 'number' ? li.amount_total
                          : typeof li.amount === 'number' ? li.amount
                          : typeof li.amount_excluding_tax === 'number' ? li.amount_excluding_tax
                          : typeof li.amount_subtotal === 'number' ? li.amount_subtotal
                          : 0);
        return {
          id: li.id,
          type: li.type,
          description: li.description || undefined,
          productId: typeof li.price?.product === 'string' ? li.price.product : li.price?.product?.id,
          productName: typeof li.price?.product === 'string' ? undefined : li.price?.product?.name,
          priceNickname: li.price?.nickname,
          unitAmount: li.price?.unit_amount || null,
          amount: lineAmount,
          currency: li.currency,
          quantity: li.quantity,
        };
      })
    };
    res.json({ invoice: mapped });
  });

  // ADMIN: Replace all lines on a draft invoice
  router.patch('/invoices/:id/lines', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
    const id = req.params.id;
    const schema = {
      lines: Array.isArray(req.body?.lines) ? req.body.lines : []
    };
    const inv = await stripe.invoices.retrieve(id, { expand: ['lines.data'] });
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    if (inv.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft invoices can be edited' });
    }
    // We need the customer to create invoice items
    const customerId = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id;
    if (!customerId) return res.status(400).json({ error: 'Invoice missing customer' });
    // Delete existing invoiceitem lines (cannot delete subscription lines)
    const existing = inv.lines?.data || [];
    for (const li of existing) {
      if (li.type === 'invoiceitem') {
        try { await stripe.invoiceItems.del(li.id); } catch (e) {}
      }
    }
    // Create new invoice items and attach to invoice
    for (const l of schema.lines) {
      if (!l || !l.productId) continue;
      const prod = await prisma.product.findUnique({ where: { id: String(l.productId) }, select: { id: true, stripeProductId: true, stripePriceId: true, priceCents: true, description: true, name: true } });
      if (!prod) continue;
      const synced = await ensureStripeProductAndPrice({ ...prod, interval: 'ONE_TIME', active: true });
      if (!synced?.stripePriceId) continue;
      await stripe.invoiceItems.create({
        customer: customerId,
        price: synced.stripePriceId,
        invoice: id,
        quantity: l.quantity && l.quantity > 0 ? l.quantity : 1,
        description: l.description || prod.description || prod.name,
        metadata: { milven: '1', productId: String(prod.id) }
      });
    }
    const refreshed = await stripe.invoices.retrieve(id, { expand: ['lines.data', 'customer', 'lines.data.price'] });
    const mapped = {
      id: refreshed.id,
      status: refreshed.status,
      total: refreshed.total ?? refreshed.amount_due ?? 0,
      amountDue: refreshed.amount_due ?? 0,
      amountPaid: refreshed.amount_paid ?? 0,
      lines: (refreshed.lines?.data || []).map(li => ({
        id: li.id,
        type: li.type,
        description: li.description || undefined,
        productId: typeof li.price?.product === 'string' ? li.price.product : li.price?.product?.id,
        productName: typeof li.price?.product === 'string' ? undefined : li.price?.product?.name,
        amount: li.amount,
        currency: li.currency,
        quantity: li.quantity,
      }))
    };
    res.json({ invoice: mapped });
  });
  // ADMIN: Create a subscription for a user and product
  router.post('/subscriptions', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
    const { userId, productId } = req.body || {};
    if (!userId || !productId) return res.status(400).json({ error: 'userId and productId required' });
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (!(product.interval === 'MONTHLY' || product.interval === 'YEARLY')) {
      return res.status(400).json({ error: 'Product must be a recurring plan' });
    }
    const customerId = await ensureStripeCustomer(user);
    const synced = await ensureStripeProductAndPrice(product);
    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: synced.stripePriceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent']
    });
    res.status(201).json({ subscription: sub });
  });

  // ADMIN: Update subscription (toggle cancel_at_period_end)
  router.put('/subscriptions/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
    const id = req.params.id;
    const { cancelAtPeriodEnd } = req.body || {};
    const sub = await stripe.subscriptions.update(id, {
      cancel_at_period_end: !!cancelAtPeriodEnd
    });
    res.json({ subscription: sub });
  });

  // ADMIN: Cancel subscription immediately
  router.delete('/subscriptions/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    try {
      if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
      const id = req.params.id;
      // Ensure exists first; return 404 instead of crashing if missing
      let existing;
      try {
        existing = await stripe.subscriptions.retrieve(id);
      } catch (e) {
        if (e && e.code === 'resource_missing') {
          return res.status(404).json({ error: 'Subscription not found' });
        }
        throw e;
      }
      // If already ended/expired, treat as no-op
      const endedStatuses = new Set(['canceled', 'incomplete_expired']);
      if (endedStatuses.has(existing.status)) {
        return res.json({ subscription: existing, note: `Already ${existing.status}` });
      }
      try {
        const sub = await stripe.subscriptions.cancel(id);
        return res.json({ subscription: sub });
      } catch (e) {
        // If immediate cancel fails (e.g., invalid state), fall back to cancel at period end
        try {
          const sub = await stripe.subscriptions.update(id, { cancel_at_period_end: true });
          return res.json({ subscription: sub, note: 'Set to cancel at period end' });
        } catch (e2) {
          throw e2;
        }
      }
    } catch (err) {
      console.error('[billing] subscriptions.cancel error:', err);
      const code = err?.code;
      if (code === 'resource_missing') {
        return res.status(404).json({ error: 'Subscription not found' });
      }
      // Gracefully handle already-canceled Stripe error message
      const msg = err?.message || '';
      if (msg.includes('canceled subscription')) {
        try {
          const sub = await stripe.subscriptions.retrieve(req.params.id);
          return res.json({ subscription: sub, note: 'Already canceled' });
        } catch {}
      }
      return res.status(400).json({ error: msg || 'Failed to cancel subscription' });
    }
  });

  // Stripe webhook (use raw body; see index.js verify hook)
  router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!stripe) return res.status(500).end();
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      if (process.env.STRIPE_WEBHOOK_SECRET) {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
      } else {
        // Dev: req.body is raw Buffer from express.raw() - must parse to get event
        const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : (typeof req.body === 'string' ? req.body : '');
        event = raw ? JSON.parse(raw) : req.body;
        if (!event || !event.type) {
          console.warn('[billing] Webhook body missing or invalid event.type');
          return res.status(400).send('Invalid webhook payload');
        }
      }
    } catch (err) {
      console.warn('[billing] Webhook signature verification failed:', err?.message ?? err);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
          const email = session.customer_details?.email || session.customer_email;
          let user = customerId ? await prisma.user.findFirst({ where: { stripeCustomerId: customerId } }) : null;
          if (!user && email) user = await prisma.user.findUnique({ where: { email } });
          if (user && !user.stripeCustomerId && customerId) {
            await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
          }
          // One-off purchase flow: grant enrollments for linked courses
          if (session.mode === 'payment' && user) {
            const productId = session.metadata?.productId || null;
            if (productId) {
              const links = await prisma.courseProduct.findMany({ where: { productId: String(productId) } });
              for (const link of links) {
                try {
                  const existing = await prisma.enrollment.findFirst({
                    where: { userId: user.id, courseId: link.courseId }
                  });
                  if (!existing) {
                    await prisma.enrollment.create({
                      data: { userId: user.id, courseId: link.courseId }
                    });
                  }
                } catch (e) {
                  console.warn('[billing] webhook enroll:', e?.message ?? e);
                }
              }
              // Also auto-create a paid invoice in Stripe for this one-time purchase
              try {
                const prod = await prisma.product.findUnique({ where: { id: String(productId) } });
                if (prod) {
                  const synced = await ensureStripeProductAndPrice(prod);
                  // Create draft invoice tagged as system-created
                  const custId = typeof customerId === 'string' ? customerId : customerId?.id;
                  let inv = custId ? await stripe.invoices.create({
                    customer: custId,
                    collection_method: 'send_invoice',
                    days_until_due: 0,
                    metadata: { milven: '1', purchase: '1', productId: String(prod.id), checkoutSession: String(session.id) }
                  }) : null;
                  if (inv) {
                  // Attach invoice item using product price
                  await stripe.invoiceItems.create({
                    customer: custId,
                    price: synced.stripePriceId,
                    invoice: inv.id,
                    quantity: 1,
                    description: prod.description || prod.name,
                    metadata: { milven: '1', type: 'purchase', productId: String(prod.id) }
                  });
                  // Finalize and mark as paid out-of-band (since checkout already charged)
                  inv = await stripe.invoices.finalizeInvoice(inv.id);
                  await stripe.invoices.pay(inv.id, { paid_out_of_band: true });
                  }
                }
              } catch (e) {
                console.warn('[billing] auto-invoice for purchase failed:', e?.message ?? e);
              }
            }
          }
          // Create/Update subscription record for STRIPE
          if (user) {
            const subId = session.subscription || null;
            // Try to map to local product via metadata
            let planValue = null;
            try {
              const productId = session.metadata?.productId || null;
              if (productId) {
                const prod = await prisma.product.findUnique({ where: { id: productId } });
                if (prod) planValue = prod.name;
              }
            } catch {}
            await prisma.subscription.upsert({
              where: { userId_provider: { userId: user.id, provider: 'STRIPE' } },
              update: { status: 'ACTIVE', plan: planValue ?? 'PRODUCT', currency: 'usd', providerReference: subId ?? undefined },
              create: { userId: user.id, provider: 'STRIPE', status: 'ACTIVE', plan: planValue ?? 'PRODUCT', currency: 'usd', providerReference: subId ?? undefined }
            });
          }
          break;
        }
        case 'invoice.payment_succeeded': {
          const inv = event.data.object;
          const customerId = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id;
          const user = customerId ? await prisma.user.findFirst({ where: { stripeCustomerId: customerId } }) : null;
          if (user) {
            // Ensure metadata tag so it appears in our invoices list
            try {
              const meta = inv.metadata || {};
              if (!meta.milven) {
                await stripe.invoices.update(inv.id, { metadata: { ...meta, milven: '1' } });
              }
            } catch {}
            // Record payment
            await prisma.paymentRecord.upsert({
              where: { provider_reference: { provider: 'STRIPE', reference: inv.id } },
              update: { status: inv.status ?? 'succeeded', amount: inv.amount_paid ?? 0, currency: inv.currency ?? 'usd', rawDataJson: inv },
              create: { userId: user.id, provider: 'STRIPE', reference: inv.id, status: inv.status ?? 'succeeded', amount: inv.amount_paid ?? 0, currency: inv.currency ?? 'usd', rawDataJson: inv }
            });
            // Auto-enroll user into linked courses for each product on the invoice
            try {
              const lineProducts = (inv.lines?.data || [])
                .map(li => li.price?.product)
                .map(p => (typeof p === 'string' ? p : p?.id))
                .filter(Boolean);
              if (lineProducts.length) {
                const locals = await prisma.product.findMany({
                  where: { stripeProductId: { in: lineProducts } },
                  select: { id: true }
                });
                if (locals.length) {
                  const links = await prisma.courseProduct.findMany({
                    where: { productId: { in: locals.map(l => l.id) } }
                  });
                  for (const link of links) {
                    try {
                      const existing = await prisma.enrollment.findFirst({
                        where: { userId: user.id, courseId: link.courseId }
                      });
                      if (!existing) {
                        await prisma.enrollment.create({
                          data: { userId: user.id, courseId: link.courseId }
                        });
                      }
                    } catch (e) {
                      console.warn('[billing] webhook invoice enroll:', e?.message ?? e);
                    }
                  }
                }
              }
            } catch {}
          }
          break;
        }
        case 'customer.subscription.updated':
        case 'customer.subscription.created': {
          const sub = event.data.object;
          const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
          const user = customerId ? await prisma.user.findFirst({ where: { stripeCustomerId: customerId } }) : null;
          if (user) {
            // Resolve product to store as plan (local product name)
            let planValue = 'PRODUCT';
            try {
              const item = sub.items?.data?.[0];
              const stripeProdId = item?.price?.product;
              if (stripeProdId) {
                const local = await prisma.product.findFirst({ where: { stripeProductId: typeof stripeProdId === 'string' ? stripeProdId : stripeProdId.id } });
                if (local) planValue = local.name;
              }
            } catch {}
            const statusMap = {
              active: 'ACTIVE',
              trialing: 'ACTIVE',
              past_due: 'PAST_DUE',
              canceled: 'CANCELED',
              unpaid: 'PAST_DUE',
              incomplete: 'INCOMPLETE',
              incomplete_expired: 'INCOMPLETE'
            };
            await prisma.subscription.upsert({
              where: { userId_provider: { userId: user.id, provider: 'STRIPE' } },
              update: {
                status: statusMap[sub.status] || 'INCOMPLETE',
                plan: planValue,
                currency: sub.items?.data?.[0]?.price?.currency ?? 'usd',
                providerReference: sub.id,
                currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null
              },
              create: {
                userId: user.id,
                provider: 'STRIPE',
                status: statusMap[sub.status] || 'INCOMPLETE',
                plan: planValue,
                currency: sub.items?.data?.[0]?.price?.currency ?? 'usd',
                providerReference: sub.id,
                currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null
              }
            });
          }
          break;
        }
        default:
          // ignore
          break;
      }
    } catch (err) {
      console.error('[billing] Webhook handler error:', err);
      return res.status(500).end();
    }
    res.json({ received: true });
  });

  return router;
}
