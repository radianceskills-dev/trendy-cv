import assert from "node:assert/strict";
import test from "node:test";
import { parseAIJSON, withCancellation } from "./src/ai-json.mjs";
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
test("requests remain pending beyond the former deadline", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	let complete;
	let inner;
	const result = withCancellation((signal) => {
		inner = signal;
		return new Promise((resolve) => {
			complete = resolve;
		});
	}, new AbortController().signal);
	t.mock.timers.tick(180000);
	assert.equal(inner.aborted, false);
	complete("finished");
	assert.equal(await result, "finished");
});
test("cancel discards non-abortable provider output", async () => {
	const c = new AbortController();
	const result = withCancellation(() => new Promise(() => {}), c.signal);
	c.abort();
	await assert.rejects(result, /Cancelled/);
});
