import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { MCP_SCOPES } from '../lib/mcp/tokenAuth.js';

const SESSION_COOKIE = 'milven_oauth_session';
const SESSION_TTL_MS = 30 * 60 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TTL_SECONDS = 60 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

function baseUrl(req) {
	return String(process.env.MCP_PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

export function oauthIssuer(req) {
	return String(process.env.MCP_OAUTH_ISSUER || `${baseUrl(req)}/oauth`).replace(/\/$/, '');
}

export function oauthAudience(req) {
	return String(process.env.MCP_OAUTH_AUDIENCE || `${baseUrl(req)}/mcp`).replace(/\/$/, '');
}

function sessionSecret() {
	return process.env.OAUTH_SESSION_SECRET || process.env.JWT_SECRET || 'dev_secret';
}

function hash(value) {
	return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function randomValue(prefix) {
	return `${prefix}_${crypto.randomBytes(32).toString('base64url')}`;
}

function escapeHtml(value) {
	return String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function cookies(req) {
	const result = {};
	for (const part of String(req.headers.cookie || '').split(';')) {
		const index = part.indexOf('=');
		if (index < 0) continue;
		const key = part.slice(0, index).trim();
		if (!key) continue;
		try { result[key] = decodeURIComponent(part.slice(index + 1).trim()); } catch { result[key] = part.slice(index + 1).trim(); }
	}
	return result;
}

function sessionFrom(req) {
	const token = cookies(req)[SESSION_COOKIE];
	if (!token) return null;
	try {
		const payload = jwt.verify(token, sessionSecret());
		return payload?.sub && payload?.role === 'ADMIN' ? payload : null;
	} catch {
		return null;
	}
}

function setSessionCookie(req, res, session) {
	res.cookie(SESSION_COOKIE, jwt.sign(session, sessionSecret(), { expiresIn: '30m' }), {
		httpOnly: true,
		secure: req.secure || process.env.NODE_ENV === 'production',
		sameSite: 'lax',
		path: '/oauth',
		maxAge: SESSION_TTL_MS
	});
}

function parseScopes(value, fallback = MCP_SCOPES) {
	const list = String(value || '').split(/\s+/).map(scope => scope.trim()).filter(Boolean);
	const scopes = [...new Set(list.length ? list : fallback)];
	return { scopes, invalid: scopes.filter(scope => !MCP_SCOPES.includes(scope)) };
}

function normalizeRedirectUri(value) {
	try {
		const url = new URL(String(value || ''));
		if (url.hash) return null;
		if (url.protocol === 'https:') return url.toString();
		if (url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return url.toString();
		return null;
	} catch {
		return null;
	}
}

function appendQuery(url, values) {
	const target = new URL(url);
	for (const [key, value] of Object.entries(values)) {
		if (value !== undefined && value !== null) target.searchParams.set(key, value);
	}
	return target.toString();
}

function authorizeParams(source) {
	const value = key => source?.[key] === undefined ? '' : String(source[key]);
	return {
		response_type: value('response_type'),
		client_id: value('client_id'),
		redirect_uri: value('redirect_uri'),
		scope: value('scope'),
		state: value('state'),
		code_challenge: value('code_challenge'),
		code_challenge_method: value('code_challenge_method'),
		resource: value('resource')
	};
}

function authorizationError(res, redirectUri, error, description, state) {
	if (!redirectUri) return res.status(400).type('text').send(description || error);
	return res.redirect(appendQuery(redirectUri, { error, error_description: description, state: state || undefined }));
}

function page(title, body) {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
	:root{color-scheme:light}body{margin:0;background:#f4f7fa;font-family:Inter,Arial,sans-serif;color:#102540}main{max-width:520px;margin:8vh auto;padding:0 18px}.card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;box-shadow:0 18px 50px rgba(16,37,64,.08)}.brand{display:flex;align-items:center;gap:10px;margin-bottom:22px}.mark{width:42px;height:42px;border-radius:12px;background:#102540;color:#fff;display:grid;place-items:center;font-weight:800}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#64748b}h1{font-size:23px;margin:8px 0 8px}p{line-height:1.55;color:#475569}.scope{display:inline-block;margin:4px 4px 0 0;padding:5px 9px;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:12px}label{display:block;font-size:13px;font-weight:600;margin:16px 0 6px}input{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:9px;padding:11px 12px;font:inherit}button{border:0;border-radius:9px;padding:11px 14px;font:inherit;font-weight:700;cursor:pointer}.primary{background:#102540;color:#fff}.secondary{background:#e2e8f0;color:#102540;margin-left:8px}.error{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:10px 12px;border-radius:9px;font-size:13px}.note{font-size:12px;color:#64748b;margin-top:18px}</style></head><body><main><div class="card"><div class="brand"><div class="mark">M</div><div><div class="eyebrow">Milven Finance School</div><strong>Question Bank MCP</strong></div></div>${body}</div></main></body></html>`;
}

function renderLogin(res, returnTo, error = '') {
	res.type('html').send(page('Milven MCP authorization', `
		<h1>Administrator sign-in</h1>
		<p>This OAuth authorization grants an AI client access to the Milven question bank. Only Milven administrators may authorize it.</p>
		${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
		<form method="post" action="/oauth/login">
			<input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
			<label for="email">Administrator email</label>
			<input id="email" name="email" type="email" autocomplete="username" required>
			<label for="password">Password</label>
			<input id="password" name="password" type="password" autocomplete="current-password" required>
			<button class="primary" type="submit">Sign in and continue</button>
		</form>
		<div class="note">Sign-in is handled by the existing Milven administrator account system. Credentials are not stored by the OAuth server.</div>
	`));
}

function renderConsent(req, res, { client, params, scopes, session }) {
	const hidden = {
		response_type: params.response_type,
		client_id: params.client_id,
		redirect_uri: params.redirect_uri,
		scope: scopes.join(' '),
		state: params.state,
		code_challenge: params.code_challenge,
		code_challenge_method: params.code_challenge_method,
		resource: params.resource,
		csrf: session.csrf
	};
	res.type('html').send(page('Authorize Milven MCP', `
		<h1>Authorize access</h1>
		<p><strong>${escapeHtml(client.clientName || client.clientId)}</strong> is requesting access to the Milven Question Bank MCP.</p>
		<p>You are authorizing this client as a Milven administrator. Every write is still staged for review.</p>
		<div>${scopes.map(scope => `<span class="scope">${escapeHtml(scope)}</span>`).join('')}</div>
		<form method="post" action="/oauth/authorize">
			${Object.entries(hidden).map(([key, value]) => `<input type="hidden" name="${key}" value="${escapeHtml(value)}">`).join('')}
			<button class="primary" name="decision" value="approve" type="submit">Approve access</button>
			<button class="secondary" name="decision" value="deny" type="submit">Cancel</button>
		</form>
		<div class="note">The authorization code expires in 10 minutes and can be exchanged only once with the matching PKCE verifier.</div>
	`));
}

async function validateAuthorizeRequest(prisma, req, source) {
	const params = authorizeParams(source);
	if (!params.client_id) return { error: 'invalid_request', description: 'client_id is required.', params, fatal: true };
	const client = await prisma.mcpOAuthClient.findUnique({ where: { clientId: params.client_id } });
	if (!client) return { error: 'invalid_client', description: 'Unknown OAuth client.', params, fatal: true };
	if (!client.redirectUris.includes(params.redirect_uri)) return { error: 'invalid_request', description: 'redirect_uri does not exactly match a registered URI.', params, client, fatal: true };
	if (params.response_type !== 'code') return { error: 'unsupported_response_type', description: 'Only authorization code flow is supported.', params, client };
	if (!params.code_challenge || params.code_challenge_method !== 'S256') return { error: 'invalid_request', description: 'PKCE with S256 is required.', params, client };
	if (params.resource && params.resource !== oauthAudience(req)) return { error: 'invalid_target', description: 'The requested resource does not match the Milven MCP audience.', params, client };
	const parsedScopes = parseScopes(params.scope, client.scopes.length ? client.scopes : MCP_SCOPES);
	if (parsedScopes.invalid.length) return { error: 'invalid_scope', description: `Unsupported scope(s): ${parsedScopes.invalid.join(', ')}`, params, client };
	return { params, client, scopes: parsedScopes.scopes };
}

async function issueTokenPair(prisma, { clientId, userId, scopes, audience, rotateFrom = null }) {
	const access = randomValue('milven_oat');
	const refresh = randomValue('milven_ort');
	const now = Date.now();
	const accessExpiresAt = new Date(now + ACCESS_TTL_SECONDS * 1000);
	const refreshExpiresAt = new Date(now + REFRESH_TTL_SECONDS * 1000);
	const result = await prisma.$transaction(async tx => {
		const accessRecord = await tx.mcpOAuthToken.create({
			data: { tokenHash: hash(access), tokenType: 'ACCESS', clientId, userId, scopes, audience, expiresAt: accessExpiresAt }
		});
		const refreshRecord = await tx.mcpOAuthToken.create({
			data: { tokenHash: hash(refresh), tokenType: 'REFRESH', clientId, userId, scopes, audience, expiresAt: refreshExpiresAt }
		});
		if (rotateFrom) {
			await tx.mcpOAuthToken.update({
				where: { id: rotateFrom.id },
				data: { revokedAt: new Date(), replacedByTokenId: refreshRecord.id }
			});
		}
		return { accessRecord, refreshRecord };
	});
	return {
		access_token: access,
		token_type: 'Bearer',
		expires_in: ACCESS_TTL_SECONDS,
		refresh_token: refresh,
		scope: scopes.join(' '),
		accessRecord: result.accessRecord,
		refreshRecord: result.refreshRecord
	};
}

function tokenError(res, error, description) {
	res.setHeader('Cache-Control', 'no-store');
	res.setHeader('Pragma', 'no-cache');
	return res.status(400).json({ error, error_description: description });
}

export function oauthAuthorizationServerMetadata(req) {
	const issuer = oauthIssuer(req);
	return {
		issuer,
		authorization_endpoint: `${issuer}/authorize`,
		token_endpoint: `${issuer}/token`,
		registration_endpoint: `${issuer}/register`,
		revocation_endpoint: `${issuer}/revoke`,
		response_types_supported: ['code'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
		code_challenge_methods_supported: ['S256'],
		scopes_supported: MCP_SCOPES,
		resource_parameter_supported: true,
		authorization_response_iss_parameter_supported: false
	};
}

export function oauthProtectedResourceMetadata(req) {
	return {
		resource: oauthAudience(req),
		authorization_servers: [oauthIssuer(req)],
		bearer_methods_supported: ['header'],
		scopes_supported: MCP_SCOPES
	};
}

export function oauthRouter(prisma) {
	const router = Router();

	router.get('/.well-known/oauth-authorization-server', (req, res) => res.json(oauthAuthorizationServerMetadata(req)));
	router.get('/.well-known/openid-configuration', (req, res) => res.json(oauthAuthorizationServerMetadata(req)));

	router.get('/login', (req, res) => {
		const returnTo = String(req.query.return_to || '');
		if (!returnTo.startsWith('/oauth/authorize?')) return res.status(400).type('text').send('Invalid authorization return path.');
		renderLogin(res, returnTo);
	});

	router.post('/login', async (req, res) => {
		const returnTo = String(req.body.return_to || '');
		if (!returnTo.startsWith('/oauth/authorize?')) return res.status(400).type('text').send('Invalid authorization return path.');
		const email = String(req.body.email || '').trim().toLowerCase();
		const password = String(req.body.password || '');
		const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, role: true, passwordHash: true } });
		if (!user || user.role !== 'ADMIN' || !(await bcrypt.compare(password, user.passwordHash))) {
			return renderLogin(res, returnTo, 'Invalid administrator credentials.');
		}
		const session = { sub: user.id, email: user.email, role: user.role, csrf: crypto.randomBytes(24).toString('base64url') };
		setSessionCookie(req, res, session);
		return res.redirect(returnTo);
	});

	router.get('/authorize', async (req, res) => {
		try {
			const validation = await validateAuthorizeRequest(prisma, req, req.query);
			if (validation.error) return authorizationError(res, validation.fatal ? null : validation.params.redirect_uri, validation.error, validation.description, validation.params.state);
			const session = sessionFrom(req);
			if (!session) {
				const returnTo = `/oauth/authorize?${new URLSearchParams(Object.entries(validation.params).filter(([, value]) => value)).toString()}`;
				return res.redirect(`/oauth/login?return_to=${encodeURIComponent(returnTo)}`);
			}
			const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { id: true, role: true } });
			if (!user || user.role !== 'ADMIN') return res.status(403).type('text').send('Administrator access is required.');
			return renderConsent(req, res, { client: validation.client, params: validation.params, scopes: validation.scopes, session });
		} catch (error) {
			console.error('[oauth.authorize]', error);
			return res.status(500).type('text').send('Unable to complete authorization.');
		}
	});

	router.post('/authorize', async (req, res) => {
		try {
			const session = sessionFrom(req);
			if (!session) {
				const returnTo = `/oauth/authorize?${new URLSearchParams(Object.entries(authorizeParams(req.body)).filter(([, value]) => value)).toString()}`;
				return res.redirect(`/oauth/login?return_to=${encodeURIComponent(returnTo)}`);
			}
			if (!session.csrf || String(req.body.csrf || '') !== session.csrf) return res.status(403).type('text').send('Invalid authorization request.');
			const validation = await validateAuthorizeRequest(prisma, req, req.body);
			if (validation.error) return authorizationError(res, validation.fatal ? null : validation.params.redirect_uri, validation.error, validation.description, validation.params.state);
			const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { id: true, role: true } });
			if (!user || user.role !== 'ADMIN') return res.status(403).type('text').send('Administrator access is required.');
			if (String(req.body.decision || '') !== 'approve') {
				return authorizationError(res, validation.params.redirect_uri, 'access_denied', 'The Milven administrator declined access.', validation.params.state);
			}
			const code = randomValue('milven_oac');
			await prisma.mcpOAuthCode.create({
				data: {
					codeHash: hash(code),
					clientId: validation.client.clientId,
					userId: user.id,
					redirectUri: validation.params.redirect_uri,
					scopes: validation.scopes,
					audience: validation.params.resource || oauthAudience(req),
					codeChallenge: validation.params.code_challenge,
					codeChallengeMethod: 'S256',
					expiresAt: new Date(Date.now() + CODE_TTL_MS)
				}
			});
			return res.redirect(appendQuery(validation.params.redirect_uri, { code, state: validation.params.state || undefined }));
		} catch (error) {
			console.error('[oauth.authorize.post]', error);
			return res.status(500).type('text').send('Unable to complete authorization.');
		}
	});

	router.post('/token', async (req, res) => {
		try {
			const grantType = String(req.body.grant_type || '');
			const clientId = String(req.body.client_id || '');
			const client = clientId ? await prisma.mcpOAuthClient.findUnique({ where: { clientId } }) : null;
			if (!client) return tokenError(res, 'invalid_client', 'Unknown OAuth client.');
			if (client.tokenEndpointAuthMethod === 'client_secret_post') {
				const secret = String(req.body.client_secret || '');
				if (!client.clientSecretHash || !secret || hash(secret) !== client.clientSecretHash) return tokenError(res, 'invalid_client', 'Client authentication failed.');
			}
			if (grantType === 'authorization_code') {
				const codeHash = hash(String(req.body.code || ''));
				const record = await prisma.mcpOAuthCode.findUnique({ where: { codeHash } });
				if (!record || record.consumedAt || record.expiresAt <= new Date()) return tokenError(res, 'invalid_grant', 'Authorization code is invalid or expired.');
				if (record.clientId !== client.clientId || record.redirectUri !== String(req.body.redirect_uri || '')) return tokenError(res, 'invalid_grant', 'Authorization code does not match this client or redirect URI.');
				const expected = crypto.createHash('sha256').update(String(req.body.code_verifier || '')).digest('base64url');
				const actual = record.codeChallenge;
				if (expected.length !== actual.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) return tokenError(res, 'invalid_grant', 'PKCE verification failed.');
				const consumed = await prisma.mcpOAuthCode.updateMany({
					where: { id: record.id, consumedAt: null, expiresAt: { gt: new Date() } },
					data: { consumedAt: new Date() }
				});
				if (!consumed.count) return tokenError(res, 'invalid_grant', 'Authorization code was already used.');
				const user = await prisma.user.findUnique({ where: { id: record.userId }, select: { id: true, role: true } });
				if (!user || user.role !== 'ADMIN') return tokenError(res, 'access_denied', 'The authorizing account is no longer an administrator.');
				const tokens = await issueTokenPair(prisma, { clientId: client.clientId, userId: user.id, scopes: record.scopes, audience: record.audience });
				res.setHeader('Cache-Control', 'no-store');
				res.setHeader('Pragma', 'no-cache');
				return res.json({
					access_token: tokens.access_token,
					token_type: tokens.token_type,
					expires_in: tokens.expires_in,
					refresh_token: tokens.refresh_token,
					scope: tokens.scope
				});
			}
			if (grantType === 'refresh_token') {
				const refreshHash = hash(String(req.body.refresh_token || ''));
				const record = await prisma.mcpOAuthToken.findUnique({ where: { tokenHash: refreshHash } });
				if (!record || record.tokenType !== 'REFRESH' || record.revokedAt || record.expiresAt <= new Date()) return tokenError(res, 'invalid_grant', 'Refresh token is invalid or expired.');
				if (record.clientId !== client.clientId) return tokenError(res, 'invalid_grant', 'Refresh token belongs to another client.');
				const user = await prisma.user.findUnique({ where: { id: record.userId }, select: { id: true, role: true } });
				if (!user || user.role !== 'ADMIN') return tokenError(res, 'access_denied', 'The authorizing account is no longer an administrator.');
				const tokens = await issueTokenPair(prisma, { clientId: client.clientId, userId: user.id, scopes: record.scopes, audience: record.audience, rotateFrom: record });
				res.setHeader('Cache-Control', 'no-store');
				res.setHeader('Pragma', 'no-cache');
				return res.json({ access_token: tokens.access_token, token_type: tokens.token_type, expires_in: tokens.expires_in, refresh_token: tokens.refresh_token, scope: tokens.scope });
			}
			return tokenError(res, 'unsupported_grant_type', 'Only authorization_code and refresh_token are supported.');
		} catch (error) {
			console.error('[oauth.token]', error);
			return tokenError(res, 'server_error', 'Unable to issue a token.');
		}
	});

	router.post('/register', async (req, res) => {
		try {
			let redirectUris = req.body.redirect_uris;
			if (!Array.isArray(redirectUris) && typeof redirectUris === 'string' && redirectUris.trim().startsWith('[')) {
				try { redirectUris = JSON.parse(redirectUris); } catch { redirectUris = null; }
			}
			if (!Array.isArray(redirectUris)) redirectUris = String(req.body.redirect_uris || req.body.redirect_uri || '').split(/\s+/).filter(Boolean);
			const normalized = redirectUris.map(normalizeRedirectUri).filter(Boolean);
			if (!normalized.length || normalized.length !== redirectUris.length) return tokenError(res, 'invalid_redirect_uri', 'Only HTTPS or localhost redirect URIs are accepted.');
			const requestedScopes = parseScopes(req.body.scope, MCP_SCOPES);
			if (requestedScopes.invalid.length) return tokenError(res, 'invalid_scope', `Unsupported scope(s): ${requestedScopes.invalid.join(', ')}`);
			const authMethod = req.body.token_endpoint_auth_method === 'client_secret_post' ? 'client_secret_post' : 'none';
			const clientId = randomValue('mcp_client');
			const clientSecret = authMethod === 'client_secret_post' ? randomValue('mcp_secret') : null;
			const client = await prisma.mcpOAuthClient.create({
				data: {
					clientId,
					clientName: String(req.body.client_name || '').slice(0, 200) || null,
					redirectUris: normalized,
					grantTypes: ['authorization_code', 'refresh_token'],
					responseTypes: ['code'],
					scopes: requestedScopes.scopes,
					tokenEndpointAuthMethod: authMethod,
					clientSecretHash: clientSecret ? hash(clientSecret) : null
				}
			});
			res.status(201).setHeader('Cache-Control', 'no-store');
			return res.json({
				client_id: client.clientId,
				client_name: client.clientName,
				redirect_uris: client.redirectUris,
				grant_types: client.grantTypes,
				response_types: client.responseTypes,
				token_endpoint_auth_method: client.tokenEndpointAuthMethod,
				scope: client.scopes.join(' '),
				...(clientSecret ? { client_secret: clientSecret } : {})
			});
		} catch (error) {
			console.error('[oauth.register]', error);
			return tokenError(res, 'server_error', 'Unable to register the OAuth client.');
		}
	});

	router.post('/revoke', async (req, res) => {
		try {
			const tokenHash = hash(String(req.body.token || ''));
			await prisma.mcpOAuthToken.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } });
			return res.status(200).json({ ok: true });
		} catch (error) {
			console.error('[oauth.revoke]', error);
			return res.status(500).json({ error: 'server_error' });
		}
	});

	return router;
}
