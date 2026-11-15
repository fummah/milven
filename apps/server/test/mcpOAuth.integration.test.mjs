import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { oauthRouter } from '../src/routes/oauth.js';
import { mcpAuthMiddleware } from '../src/lib/mcp/tokenAuth.js';
import { createMcpRequestHandler } from '../src/mcp-dist/http.mjs';

const enabled = process.env.RUN_OAUTH_INTEGRATION === '1' && Boolean(process.env.DATABASE_URL);

test('OAuth authorization code with PKCE issues scoped MCP tokens and rotates refresh tokens', { skip: !enabled }, async () => {
	const prisma = new PrismaClient();
	const app = express();
	app.set('trust proxy', 1);
	app.use(express.json());
	app.use(express.urlencoded({ extended: false }));
	app.use('/oauth', oauthRouter(prisma));
	app.post('/mcp', mcpAuthMiddleware(prisma), createMcpRequestHandler(prisma, { endpoint: '/mcp' }));
	const server = app.listen(0);
	await new Promise(resolve => server.once('listening', resolve));
	const base = `http://127.0.0.1:${server.address().port}`;
	let clientId = null;
	let cookie = '';
	const request = async (path, options = {}) => {
		const response = await fetch(base + path, {
			...options,
			redirect: 'manual',
			headers: {
				...(options.form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
				...(cookie ? { cookie } : {}),
				...(options.headers || {})
			}
		});
		const setCookie = response.headers.get('set-cookie');
		if (setCookie) cookie = setCookie.split(';')[0];
		return response;
	};
	try {
		const metadata = await (await request('/oauth/.well-known/oauth-authorization-server')).json();
		assert.equal(metadata.code_challenge_methods_supported[0], 'S256');
		assert.ok(metadata.registration_endpoint.endsWith('/oauth/register'));

		const redirectUri = `${base}/callback`;
		const verifier = crypto.randomBytes(32).toString('base64url');
		const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
		const registration = await (await request('/oauth/register', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				client_name: 'Milven OAuth automated test',
				redirect_uris: [redirectUri],
				token_endpoint_auth_method: 'none',
				scope: 'curriculum:read questions:read questions:validate questions:draft questions:commit'
			})
		})).json();
		clientId = registration.client_id;
		assert.ok(clientId);

		const params = new URLSearchParams({
			response_type: 'code',
			client_id: clientId,
			redirect_uri: redirectUri,
			scope: 'curriculum:read questions:read questions:validate questions:draft questions:commit',
			state: 'oauth-test-state',
			code_challenge: challenge,
			code_challenge_method: 'S256',
			resource: `${base}/mcp`
		});
		const firstAuthorize = await request('/oauth/authorize?' + params.toString());
		assert.equal(firstAuthorize.status, 302);
		const loginRedirect = firstAuthorize.headers.get('location');
		const returnTo = new URL(loginRedirect, base).searchParams.get('return_to');
		const login = await request('/oauth/login', {
			method: 'POST',
			form: true,
			body: new URLSearchParams({
				return_to: returnTo,
				email: process.env.ADMIN_TEST_EMAIL || 'admin@milven.finance',
				password: process.env.ADMIN_TEST_PASSWORD || 'Milven#2026'
			})
		});
		assert.equal(login.status, 302);
		assert.ok(cookie);
		const consentPage = await (await request(returnTo)).text();
		const csrf = consentPage.match(/name="csrf" value="([^"]+)"/)?.[1];
		assert.ok(csrf);
		const consent = await request('/oauth/authorize', {
			method: 'POST',
			form: true,
			body: new URLSearchParams({ ...Object.fromEntries(params), csrf, decision: 'approve' })
		});
		assert.equal(consent.status, 302);
		const callback = new URL(consent.headers.get('location'));
		assert.equal(callback.searchParams.get('state'), 'oauth-test-state');
		const code = callback.searchParams.get('code');
		assert.ok(code);

		const tokenResponse = await request('/oauth/token', {
			method: 'POST',
			form: true,
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				client_id: clientId,
				redirect_uri: redirectUri,
				code,
				code_verifier: verifier
			})
		});
		assert.equal(tokenResponse.status, 200);
		const tokens = await tokenResponse.json();
		assert.ok(tokens.access_token.startsWith('milven_oat_'));
		assert.ok(tokens.refresh_token.startsWith('milven_ort_'));

		const mcpClient = new Client({ name: 'oauth-automated-test', version: '1.0.0' });
		await mcpClient.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp'), {
			requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } }
		}));
		const toolList = await mcpClient.listTools();
		assert.equal(toolList.tools.length, 18);
		const capabilities = await mcpClient.callTool({ name: 'milven_get_capabilities', arguments: {} });
		assert.equal(capabilities.structuredContent?.authenticatedAs?.authType, 'oauth');
		await mcpClient.close();

		const refreshBody = new URLSearchParams({
			grant_type: 'refresh_token',
			client_id: clientId,
			refresh_token: tokens.refresh_token
		});
		const refreshedResponse = await request('/oauth/token', { method: 'POST', form: true, body: refreshBody });
		assert.equal(refreshedResponse.status, 200);
		const refreshed = await refreshedResponse.json();
		const replay = await request('/oauth/token', { method: 'POST', form: true, body: refreshBody });
		assert.equal((await replay.json()).error, 'invalid_grant');

		const revoke = await request('/oauth/revoke', { method: 'POST', form: true, body: new URLSearchParams({ token: refreshed.access_token }) });
		assert.equal(revoke.status, 200);
		const revoked = await request('/mcp', {
			method: 'POST',
			headers: { Authorization: `Bearer ${refreshed.access_token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'revoked', version: '1' } } })
		});
		assert.equal(revoked.status, 401);
	} finally {
		if (clientId) await prisma.mcpOAuthClient.deleteMany({ where: { clientId } });
		await new Promise(resolve => server.close(resolve));
		await prisma.$disconnect();
	}
});
