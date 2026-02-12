import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';

export function paymentsRouter(prisma) {
	const router = Router();

	// Initiate a subscription/payment (returns provider-hosted checkout URL placeholder)
	router.post('/initiate', requireAuth(), async (req, res) => {
		const { provider, plan } = req.body || {};
		if (!['FLUTTERWAVE', 'PAYFAST'].includes(provider)) {
			return res.status(400).json({ error: 'Unsupported provider' });
		}
		// In production, create a checkout session via provider API and return the redirect URL.
		// For MVP, return a placeholder URL with query params.
		const base = provider === 'FLUTTERWAVE' ? 'https://checkout.flutterwave.com/v3/hosted/pay' : 'https://www.payfast.co.za/eng/process';
		const url = `${base}?m=mutingwende&plan=${encodeURIComponent(plan || 'standard')}&u=${encodeURIComponent(req.user.id)}`;
		return res.json({ url, provider });
	});

	// Check subscription status
	router.get('/subscriptions/me', requireAuth(), async (req, res) => {
		const sub = await prisma.subscription.findFirst({
			where: { userId: req.user.id, status: { in: ['ACTIVE', 'PAST_DUE'] } }
		});
		return res.json({ subscription: sub ?? null });
	});

	// Flutterwave webhook (stubbed verification)
	router.post('/webhooks/flutterwave', async (req, res) => {
		try {
			const payload = req.body;
			const email = payload?.data?.customer?.email;
			const amount = Math.round(Number(payload?.data?.amount || 0) * 100);
			const currency = payload?.data?.currency || 'USD';
			const reference = String(payload?.data?.tx_ref || payload?.data?.id || '');
			const status = payload?.data?.status || 'unknown';
			const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
			if (user && reference) {
				await prisma.paymentRecord.upsert({
					where: { provider_reference: { provider: 'FLUTTERWAVE', reference } },
					update: { status, amount, currency, rawDataJson: payload },
					create: {
						userId: user.id,
						provider: 'FLUTTERWAVE',
						reference,
						status,
						amount,
						currency,
						rawDataJson: payload
					}
				});
				if (status === 'successful') {
					await prisma.subscription.upsert({
						where: { userId_provider: { userId: user.id, provider: 'FLUTTERWAVE' } },
						update: { status: 'ACTIVE' },
						create: { userId: user.id, provider: 'FLUTTERWAVE', status: 'ACTIVE', currency }
					});
				}
			}
		} catch (e) {
			// ignore
		}
		return res.json({ received: true });
	});

	// PayFast webhook (IPN) — placeholder
	router.post('/webhooks/payfast', async (req, res) => {
		try {
			const payload = req.body;
			const email = payload?.email_address;
			const amount = Math.round(Number(payload?.amount_gross || 0) * 100);
			const currency = payload?.currency || 'ZAR';
			const reference = String(payload?.m_payment_id || payload?.pf_payment_id || '');
			const status = payload?.payment_status || 'unknown';
			const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
			if (user && reference) {
				await prisma.paymentRecord.upsert({
					where: { provider_reference: { provider: 'PAYFAST', reference } },
					update: { status, amount, currency, rawDataJson: payload },
					create: {
						userId: user.id,
						provider: 'PAYFAST',
						reference,
						status,
						amount,
						currency,
						rawDataJson: payload
					}
				});
				if (status?.toLowerCase() === 'complete') {
					await prisma.subscription.upsert({
						where: { userId_provider: { userId: user.id, provider: 'PAYFAST' } },
						update: { status: 'ACTIVE' },
						create: { userId: user.id, provider: 'PAYFAST', status: 'ACTIVE', currency }
					});
				}
			}
		} catch (e) {
			// ignore
		}
		return res.json({ received: true });
	});

	return router;
}


