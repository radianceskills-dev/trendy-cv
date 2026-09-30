import assert from "node:assert/strict";
import test from "node:test";
import { applyReviewChange, parseReviewYAML, validateReview } from "./src/review.mjs";
import { emptyCV } from "./src/wizard-model.mjs";

const yaml = `changes:
  - field: skills
    action: suggest_add
    proposed: SQL
    reason: Relevant
    question: Do you know SQL?
`;
test("YAML reviewer produces targeted additions without dropping skills", () => {
	const cv = { ...emptyCV(), skills: ["Python"] };
	const [s] = validateReview(parseReviewYAML(yaml), cv);
	assert.deepEqual(applyReviewChange(cv, s).skills, ["Python", "SQL"]);
	assert.deepEqual(cv.skills, ["Python"]);
});
test("stale edits rejected", () => {
	const cv = emptyCV();
	const [s] = validateReview(parseReviewYAML(yaml), cv);
	assert.throws(() => applyReviewChange({ ...cv, skills: ["New edit"] }, s), /changed since/);
});
test("duplicate keys, aliases, tags and multiple YAML documents rejected", () => {
	for (const text of [
		"changes: []\nchanges: []",
		"changes: &x []\nother: *x",
		"changes: !unknown []",
		"changes: []\n---\nchanges: []",
	])
		assert.throws(() => parseReviewYAML(text));
});
test("contact edits and invalid actions rejected", () => {
	assert.throws(() =>
		validateReview(
			{ changes: [{ field: "email", action: "replace", proposed: "x", reason: "", question: "" }] },
			emptyCV(),
		),
	);
});
test("multiline replacement and question only changes", () => {
	const [s] = validateReview(
		parseReviewYAML(
			'changes:\n  - field: summary\n    action: replace\n    proposed: ""\n    reason: Missing\n    question: What is your focus?',
		),
		emptyCV(),
	);
	assert.throws(() => applyReviewChange(emptyCV(), s), /missing information/);
});
