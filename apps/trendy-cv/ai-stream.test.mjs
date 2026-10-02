import assert from "node:assert/strict";
import test from "node:test";
import { readAIStream } from "./src/ai-stream.mjs";

test("stream handles fragmented UTF8, CRLF and multiple events", async () => {
	const bytes = new TextEncoder().encode(
		'data: {"choices":[{"delta":{"content":"hé"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"llo"}}]}\n\ndata: [DONE]\n\n',
	);
	const response = new Response(
		new ReadableStream({
			start(c) {
				for (const byte of bytes) c.enqueue(new Uint8Array([byte]));
				c.close();
			},
		}),
	);
	const chunks = [];
	assert.equal(await readAIStream(response, (s) => chunks.push(s)), "héllo");
	assert.deepEqual(chunks, ["hé", "llo"]);
});
test("truncated output remains visible but is rejected", async () => {
	const text = [];
	await assert.rejects(
		readAIStream(
			new Response('data: {"choices":[{"delta":{"content":"partial"},"finish_reason":"length"}]}\n\n'),
			(s) => text.push(s),
		),
		/cut off/,
	);
	assert.deepEqual(text, ["partial"]);
});
