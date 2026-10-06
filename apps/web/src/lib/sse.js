/**
 * Shared Server-Sent Events parser for the frontend.
 *
 * Handles arbitrary network chunk boundaries (Nginx/Caddy re-chunking),
 * CRLF or LF line endings, and multi-line `data:` fields.
 *
 * This is deliberately stateful across chunks: the current event name is
 * tracked between reads, so `event: result` arriving in one chunk and
 * `data: {...}` in the next is still parsed correctly.
 */

export function parseSseMessage(rawMessage) {
	const lines = rawMessage.split('\n');
	let event = 'message';
	const dataLines = [];
	for (const line of lines) {
		if (!line || line.startsWith(':')) continue; // comment / keepalive
		if (line.startsWith('event:')) event = line.slice(6).trim();
		else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
	}
	if (dataLines.length === 0) return null;
	const dataStr = dataLines.join('\n');
	let data = dataStr;
	try { data = JSON.parse(dataStr); } catch { /* leave as raw string */ }
	return { event, data };
}

export function createSseParser(onEvent) {
	let buffer = '';
	const drain = () => {
		let sep;
		while ((sep = buffer.indexOf('\n\n')) !== -1) {
			const rawMessage = buffer.slice(0, sep);
			buffer = buffer.slice(sep + 2);
			const evt = parseSseMessage(rawMessage);
			if (evt) onEvent(evt);
		}
	};
	return {
		push(chunk) {
			// Normalize line endings but keep the message separator intact.
			buffer += String(chunk).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
			drain();
		},
		flush() {
			if (buffer.trim()) {
				const evt = parseSseMessage(buffer);
				if (evt) onEvent(evt);
			}
			buffer = '';
		},
	};
}

/**
 * Read an SSE response body and invoke `onEvent({ event, data })` per message.
 * `body` is a ReadableStream (e.g. `response.body`).
 */
export async function readSseStream(body, onEvent) {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	const parser = createSseParser(onEvent);
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		parser.push(decoder.decode(value, { stream: true }));
	}
	parser.push(decoder.decode());
	parser.flush();
}
