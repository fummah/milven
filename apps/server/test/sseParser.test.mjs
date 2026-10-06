/**
 * Tests for the shared frontend SSE parser used by the AI generators.
 * Proves the parser is resilient to arbitrary network chunk boundaries
 * (the bug that caused "No result received from AI generation").
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSseParser, parseSseMessage, readSseStream } from '../../web/src/lib/sse.js';

function collect(chunks) {
	const events = [];
	const parser = createSseParser(evt => events.push(evt));
	for (const c of chunks) parser.push(c);
	parser.flush();
	return events;
}

test('parser: parses a normal multi-event SSE stream', () => {
	const stream = 'event: progress\ndata: {"step":"init"}\n\nevent: result\ndata: {"generated":{"items":[{"name":"Speed"}]}}\n\n';
	const events = collect([stream]);
	assert.equal(events.length, 2);
	assert.equal(events[0].event, 'progress');
	assert.equal(events[1].event, 'result');
	assert.equal(events[1].data.generated.items[0].name, 'Speed');
});

test('parser: survives char-by-char delivery (re-chunking bug fix)', () => {
	const stream = 'event: progress\ndata: {"step":"generating"}\n\nevent: result\ndata: {"generated":{"items":[{"name":"Speed"}]}}\n\n';
	const events = collect(stream.split(''));
	const result = events.find(e => e.event === 'result');
	assert.ok(result, 'result event must survive char-by-char chunking');
	assert.equal(result.data.generated.items[0].name, 'Speed');
});

test('parser: survives CRLF line endings', () => {
	const stream = 'event: result\r\ndata: {"ok":true}\r\n\r\n';
	const events = collect([stream]);
	assert.equal(events[0].event, 'result');
	assert.equal(events[0].data.ok, true);
});

test('parser: parses error events with metadata', () => {
	const stream = 'event: error\ndata: {"error":"AI_GENERATION_EMPTY","message":"empty","provider":"openai","model":"gpt-4o-mini"}\n\n';
	const events = collect([stream]);
	assert.equal(events[0].event, 'error');
	assert.equal(events[0].data.error, 'AI_GENERATION_EMPTY');
	assert.equal(events[0].data.provider, 'openai');
});

test('parser: ignores keepalive comments', () => {
	const stream = ': keepalive\n\nevent: result\ndata: {"ok":true}\n\n';
	const events = collect([stream]);
	assert.equal(events.length, 1);
	assert.equal(events[0].event, 'result');
});

test('parser: handles multi-line data fields', () => {
	const msg = parseSseMessage('event: result\ndata: line1\ndata: line2');
	assert.equal(msg.event, 'result');
	assert.equal(msg.data, 'line1\nline2');
});

test('readSseStream: reads a real ReadableStream', async () => {
	const stream = 'event: result\ndata: {"ok":true}\n\n';
	const body = new ReadableStream({
		start(controller) {
			// Deliver in tiny pieces to emulate a proxy.
			for (const ch of stream) controller.enqueue(new TextEncoder().encode(ch));
			controller.close();
		},
	});
	const events = [];
	await readSseStream(body, evt => events.push(evt));
	assert.equal(events.length, 1);
	assert.equal(events[0].data.ok, true);
});
