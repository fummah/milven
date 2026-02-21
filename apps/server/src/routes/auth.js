import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import crypto from 'crypto';
import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';

dotenv.config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export function authRouter(prisma) {
	const router = Router();

	const registerSchema = z.object({
		email: z.string().email(),
		password: z.string().min(8),
		firstName: z.string().max(200).optional(),
		lastName: z.string().max(200).optional(),
		phone: z.string().max(50).optional(),
		country: z.string().max(120).optional(),
		level: z.enum(['LEVEL1', 'LEVEL2', 'LEVEL3']).optional()
	});

	const loginSchema = z.object({
		email: z.string().email(),
		password: z.string().min(8)
	});

	
	async function sendEmail(to, subject, text, html) {
		try {
			const msg = {
				to,
				from: process.env.EMAIL_FROM,
				subject,
				text,
				...(html && { html })
			};

			await sgMail.send(msg);
			console.log(`✅ Email sent to ${to}`);
		} catch (error) {
			console.error("❌ Email error:", error.response?.body || error.message);
			// DO NOT throw → prevents crash
		}
	}


	router.post('/register', async (req, res) => {
		try {
		const parse = registerSchema.safeParse(req.body);
		if (!parse.success) {
			return res.status(400).json({ error: parse.error.flatten() });
		}
		const { email, password, firstName, lastName, phone, country, level } = parse.data;
		const existing = await prisma.user.findUnique({ where: { email } });
		if (existing) {
			return res.status(409).json({ error: 'Email already in use' });
		}
		const passwordHash = await bcrypt.hash(password, 12);
		const user = await prisma.user.create({
			data: {
				email,
				passwordHash,
				role: 'STUDENT',
				level: level ?? 'LEVEL1',
				firstName: firstName || null,
				lastName: lastName || null,
				phone: phone || null,
				country: country || null
			},
			select: { id: true, email: true, role: true, level: true, createdAt: true }
		});
		const token = crypto.randomBytes(24).toString('hex');
		const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
		await prisma.emailVerificationToken.create({
			data: { userId: user.id, token, expiresAt }
		});
		const baseUrl = process.env.WEB_BASE_URL ?? 'http://localhost:5173';
		const verifyUrl = `${baseUrl}/verify-email?token=${token}`;
		const html = `<p>Welcome! Please verify your email by clicking the link below.</p><p><a href="${verifyUrl}">Verify my email</a></p><p>Or copy this link: ${verifyUrl}</p><p>This link expires in 24 hours.</p>`;
		await sendEmail(user.email, 'Verify your email – Milven Finance School', `Verify your email: ${verifyUrl}`, html);
		return res.status(201).json({ user, message: 'Please check your email to verify your account before logging in.' });
	} catch (err) {
			console.error("Register error:", err);
			return res.status(500).json({ error: 'Internal server error' });
		}
	});
	

	router.post('/login', async (req, res) => {
		try{
		const parse = loginSchema.safeParse(req.body);
		if (!parse.success) {
			return res.status(400).json({ error: parse.error.flatten() });
		}
		const { email, password } = parse.data;
		const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true,firstName:true,lastName:true, role: true, level: true, passwordHash: true, emailVerifiedAt: true } });
		if (!user) {
			return res.status(401).json({ error: 'Invalid credentials' });
		}
		const ok = await bcrypt.compare(password, user.passwordHash);
		if (!ok) {
			return res.status(401).json({ error: 'Invalid credentials' });
		}
		if (user.role === 'STUDENT' && !user.emailVerifiedAt) {
			return res.status(403).json({ error: 'Please verify your email before logging in.', code: 'EMAIL_NOT_VERIFIED' });
		}
		const token = jwt.sign(
			{ sub: user.id, role: user.role, level: user.level,firstName:user.firstName,lastName:user.lastName },
			process.env.JWT_SECRET ?? 'dev_secret',
			{ expiresIn: '7d' }
		);
		return res.json({
			token,
			user: { id: user.id, email: user.email, role: user.role, level: user.level,firstName:user.firstName,lastName:user.lastName }
		});
		} catch (err) {
			console.error("Login error:", err);
			return res.status(500).json({ error: 'Internal server error' });
		}
	});

	// Request email verification link
	router.post('/verify-email/request', async (req, res) => {
		try{
		const bodySchema = z.object({ email: z.string().email() });
		const parse = bodySchema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const user = await prisma.user.findUnique({ where: { email: parse.data.email } });
		if (!user) return res.status(200).json({ ok: true }); // do not reveal
		const token = crypto.randomBytes(24).toString('hex');
		const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
		await prisma.emailVerificationToken.upsert({
			where: { userId: user.id },
			update: { token, expiresAt, usedAt: null },
			create: { userId: user.id, token, expiresAt }
		});
		const url = `${process.env.WEB_BASE_URL ?? 'http://localhost:5173'}/verify-email?token=${token}`;
		const html = `<p>Click to verify your email: <a href="${url}">${url}</a></p>`;
		await sendEmail(user.email, 'Verify your email – Milven Finance School', `Click to verify: ${url}`, html);
		return res.json({ ok: true });
		} catch (err) {
			console.error("Verify request error:", err);
			return res.status(500).json({ error: 'Internal server error' });
		}
	});

	// Confirm email verification
	router.post('/verify-email/confirm', async (req, res) => {
		try{
		const bodySchema = z.object({ token: z.string().min(10) });
		const parse = bodySchema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const record = await prisma.emailVerificationToken.findUnique({ where: { token: parse.data.token } });
		if (!record || record.usedAt || record.expiresAt < new Date()) {
			return res.status(400).json({ error: 'Invalid token' });
		}
		await prisma.$transaction([
			prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
			prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } })
		]);
		return res.json({ ok: true });
		} catch (err) {
			console.error("Verify confirm error:", err);
			return res.status(500).json({ error: 'Internal server error' });
		}
	});

	// Request password reset
	router.post('/password/reset/request', async (req, res) => {
		try{
		const bodySchema = z.object({ email: z.string().email() });
		const parse = bodySchema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const user = await prisma.user.findUnique({ where: { email: parse.data.email } });
		if (user) {
			const token = crypto.randomBytes(24).toString('hex');
			const expiresAt = new Date(Date.now() + 1000 * 60 * 60);
			await prisma.passwordResetToken.create({ data: { userId: user.id, token, expiresAt } });
			const url = `${process.env.WEB_BASE_URL ?? 'http://localhost:5173'}/reset-password?token=${token}`;
			const html = `<p>Reset your password: <a href="${url}">${url}</a></p><p>This link expires in 1 hour.</p>`;
			await sendEmail(user.email, 'Password reset – Milven Finance School', `Reset your password: ${url}`, html);
		}
		return res.json({ ok: true });
		} catch (err) {
			console.error("Password reset request error:", err);
			return res.status(500).json({ error: 'Internal server error' });
		}
	});

	// Reset password
	router.post('/password/reset/confirm', async (req, res) => {
		try{
		const bodySchema = z.object({ token: z.string().min(10), password: z.string().min(8) });
		const parse = bodySchema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const record = await prisma.passwordResetToken.findUnique({ where: { token: parse.data.token } });
		if (!record || record.usedAt || record.expiresAt < new Date()) {
			return res.status(400).json({ error: 'Invalid token' });
		}
		const passwordHash = await bcrypt.hash(parse.data.password, 12);
		await prisma.$transaction([
			prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
			prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } })
		]);
		return res.json({ ok: true });
		} catch (err) {
			console.error("Password reset confirm error:", err);
			return res.status(500).json({ error: 'Internal server error' });
		}
	});

	return router;
}


