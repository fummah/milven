import crypto from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export const MCP_SCOPES = [
	'questions:read',
	'curriculum:read',
	'questions:validate',
	'questions:draft',
	'questions:commit'
];

export const WRITE_SCOPES = ['questions:draft', 'questions:commit'];

export function hashMcpToken(token) {
	return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function createMcpTokenValue() {
	const value = `mcp_${crypto.randomBytes(36).toString('base64url')}`;
	return { value, tokenHash: hashMcpToken(value), tokenPrefix: value.slice(0, 12) };
}

export function normalizeScopes(scopes) {
	const list = Array.isArray(scopes) ? scopes : String(scopes || '').split(/\s+/);
	return [...new Set(list.map(scope => String(scope).trim()).filter(scope => MCP_SCOPES.includes(scope)))];
}

function bearerToken(req) {
	const header = String(req.headers?.authorization || '');
	return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

let jwks = null;
function oauthConfigured() {
	return Boolean(process.env.MCP_OAUTH_JWKS_URL && process.env.MCP_OAUTH_ISSUER && process.env.MCP_OAUTH_AUDIENCE);
}

async function verifyOAuthToken(prisma, token) {
	if (!oauthConfigured()) return null;
	try {
		if (!jwks) jwks = createRemoteJWKSet(new URL(process.env.MCP_OAUTH_JWKS_URL));
		const { payload } = await jwtVerify(token, jwks, {
			issuer: process.env.MCP_OAUTH_ISSUER,
			audience: process.env.MCP_OAUTH_AUDIENCE
		});
		const email = String(payload.email || payload.preferred_username || '').toLowerCase();
		const user = email ? await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, role: true } }) : null;
		if (!user || user.role !== 'ADMIN') return null;
		const scopes = normalizeScopes(payload.scope || payload.scopes || []);
		return {
			tokenId: `oauth:${payload.sub || email}`,
			userId: user.id,
			email: user.email,
			role: user.role,
			scopes: scopes.length ? scopes : MCP_SCOPES,
			authType: 'oauth'
		};
	} catch (error) {
		console.warn('[mcp.oauth]', error?.message || error);
		return null;
	}
}

export async function authenticateMcpRequest(prisma, req) {
	const token = bearerToken(req);
	if (!token) return null;
	if (token.startsWith('eyJ')) {
		const oauth = await verifyOAuthToken(prisma, token);
		if (oauth) return oauth;
	}
	const tokenHash = hashMcpToken(token);
	const record = await prisma.mcpApiToken.findUnique({
		where: { tokenHash },
		include: { user: { select: { id: true, email: true, role: true } } }
	});
	if (!record || record.revokedAt || (record.expiresAt && record.expiresAt.getTime() <= Date.now())) return null;
	if (!record.user || record.user.role !== 'ADMIN') return null;
	prisma.mcpApiToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
	return {
		tokenId: record.id,
		userId: record.user.id,
		email: record.user.email,
		role: record.user.role,
		scopes: normalizeScopes(record.scopes),
		authType: 'token'
	};
}

export function hasScope(auth, scope) {
	return Boolean(auth && Array.isArray(auth.scopes) && auth.scopes.includes(scope));
}

export function mcpAuthMiddleware(prisma) {
	return async (req, res, next) => {
		const auth = await authenticateMcpRequest(prisma, req);
		if (!auth) {
			res.setHeader('WWW-Authenticate', `Bearer realm="milven-mcp", resource_metadata="${process.env.MCP_PUBLIC_URL || 'https://dev.milven.zbsburial.com'}/.well-known/oauth-protected-resource"`);
			return res.status(401).json({
				jsonrpc: '2.0',
				error: { code: -32001, message: 'Unauthorized MCP request.' },
				id: null
			});
		}
		req.mcpAuth = auth;
		next();
	};
}
