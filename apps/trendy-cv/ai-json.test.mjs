import assert from "node:assert/strict";
import test from "node:test";
import { parseAIJSON, withDeadline } from "./src/ai-json.mjs";
import { emptyCV, validateCV } from "./src/wizard-model.mjs";

test("valid JSON preserves text and punctuation", () =>
	assert.deepEqual(parseAIJSON('{"text":"O\'Brien, SQL"}'), { text: "O'Brien, SQL" }));
test("repairs fences, unquoted keys, single quotes and trailing commas", () =>
	assert.deepEqual(parseAIJSON("```json\n{skills: ['SQL', 'Python',],}\n```"), { skills: ["SQL", "Python"] }));
test("repaired data still must pass CV schema validation", () =>
	assert.throws(() => validateCV(parseAIJSON("{skills:'SQL'}"))));
test("repairs a complete CV response", () =>
	assert.deepEqual(validateCV(parseAIJSON(`\`\`\`json\n${JSON.stringify(emptyCV())}\n\`\`\``)), emptyCV()));
test("rejects empty or oversized model output", () => {
	assert.throws(() => parseAIJSON(""));
	assert.throws(() => parseAIJSON("x".repeat(100001)));
});
test("deadline bounds non-abortable provider promises", async () => {
	let inner;
	await assert.rejects(
		withDeadline(
			(signal) => {
				inner = signal;
				return new Promise(() => {});
			},
			new AbortController().signal,
			10,
		),
		/timed out/,
	);
	assert(inner.aborted);
});
test("cancel discards non-abortable provider output", async () => {
	const c = new AbortController();
	const result = withDeadline(() => new Promise(() => {}), c.signal);
	c.abort();
	await assert.rejects(result, /Cancelled/);
});
