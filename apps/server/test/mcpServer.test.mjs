import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMilvenMcpServer } from '../src/mcp-dist/http.mjs';

const AUTH = {
	tokenId: 'test-token',
	userId: 'admin-1',
	email: 'admin@example.test',
	role: 'ADMIN',
	scopes: ['questions:read', 'curriculum:read', 'questions:validate', 'questions:draft', 'questions:commit'],
	authType: 'token'
};

async function connectedClient() {
	const server = createMilvenMcpServer({ prisma: {}, auth: AUTH, endpoint: 'http://localhost:4000/mcp' });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'milven-mcp-test', version: '1.0.0' });
	await client.connect(clientTransport);
	return { client, server };
}

test('MCP advertises the complete Milven tool, resource and prompt catalogue', async () => {
	const { client, server } = await connectedClient();
	try {
		const tools = await client.listTools();
		const resources = await client.listResources();
		const prompts = await client.listPrompts();
		assert.equal(tools.tools.length, 18);
		assert.deepEqual(tools.tools.map(tool => tool.name).sort(), [
			'milven_check_question_duplicates',
			'milven_commit_approved_questions',
			'milven_create_question_batch',
			'milven_create_question_draft',
			'milven_get_capabilities',
			'milven_get_curriculum_context',
			'milven_get_import_status',
			'milven_get_question',
			'milven_get_question_blueprint',
			'milven_get_question_preview',
			'milven_list_concepts',
			'milven_list_courses',
			'milven_list_modules',
			'milven_list_topics',
			'milven_list_volumes',
			'milven_search_questions',
			'milven_update_question_draft',
			'milven_validate_questions'
		].sort());
		assert.equal(resources.resources.length, 5);
		assert.equal(prompts.prompts.length, 8);
		const writeTool = tools.tools.find(tool => tool.name === 'milven_commit_approved_questions');
		assert.match(writeTool.description, /approved/i);
		const validationTool = tools.tools.find(tool => tool.name === 'milven_validate_questions');
		assert.match(validationTool.description, /Read-only/i);
	} finally {
		await client.close();
		await server.close();
	}
});
