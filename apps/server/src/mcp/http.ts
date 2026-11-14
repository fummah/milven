import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMilvenMcpServer } from './server.js';
export { createMilvenMcpServer } from './server.js';

function methodNotAllowed(res: any) {
	if (res.headersSent) return;
	res.writeHead(405, { Allow: 'POST' }).end(JSON.stringify({
		jsonrpc: '2.0',
		error: { code: -32000, message: 'Method not allowed. Use POST for Streamable HTTP MCP requests.' },
		id: null
	}));
}

export function createMcpRequestHandler(prisma: any, { endpoint = '/mcp' } = {}) {
	return async function mcpRequestHandler(req: any, res: any) {
		if (req.method !== 'POST') return methodNotAllowed(res);
		if (!req.mcpAuth) {
			res.setHeader('WWW-Authenticate', `Bearer realm="milven-mcp", resource_metadata="${process.env.MCP_PUBLIC_URL || 'https://dev.milven.zbsburial.com'}/.well-known/oauth-protected-resource"`);
			return res.status(401).json({
				jsonrpc: '2.0',
				error: { code: -32001, message: 'Unauthorized MCP request.' },
				id: null
			});
		}
		const server = createMilvenMcpServer({ prisma, auth: req.mcpAuth, endpoint });
		const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
		try {
			await server.connect(transport);
			await transport.handleRequest(req, res, req.body);
			res.on('close', () => {
				transport.close().catch(() => {});
				server.close().catch(() => {});
			});
		} catch (error: any) {
			console.error('[mcp.request]', error?.stack || error);
			if (!res.headersSent) {
				res.status(500).json({
					jsonrpc: '2.0',
					error: { code: -32603, message: 'Internal MCP server error.' },
					id: null
				});
			}
		}
	};
}
