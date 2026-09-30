import assert from "node:assert/strict";
import test from "node:test";
import {
	approvedSkills,
	emptyCV,
	escapeHTML,
	validateCV,
	validateOptimization,
	validateSuggestions,
	validateTarget,
} from "./src/wizard-model.mjs";

test("target analysis keeps inferred additions explicit", () => {
	assert.deepEqual(
		validateTarget({
			roles: ["Engineer"],
			titles: [],
			industries: [],
			keywords: [],
			inferred: ["Software engineering"],
			questions: [],
		}).inferred,
		["Software engineering"],
	);
});
test("CV extraction rejects invalid fields", () => {
	assert.throws(() => validateCV({ ...emptyCV(), skills: "SQL" }));
	assert.throws(() => validateCV({ ...emptyCV(), injected: "x" }));
});
test("suggestions cannot silently change contact or work history", () => {
	assert.throws(() =>
		validateSuggestions({
			suggestions: [{ field: "experience", reason: "", question: "", proposed: "Invented employer" }],
		}),
	);
});
test("optimization can only group existing skill indices within limits", () => {
	const cv = { ...emptyCV(), skills: ["SQL", "Python", "Excel"] };
	const result = validateOptimization({ skillGroups: [[1, 0], [2]], note: "Grouped" }, cv, "simple");
	assert.deepEqual(approvedSkills(cv, result), ["Python · SQL", "Excel"]);
	for (const groups of [[[3]], [[0, 0]], [["New skill"]]])
		assert.throws(() => validateOptimization({ skillGroups: groups, note: "" }, cv, "simple"));
});
test("HTML escaping preserves literal CV content", () => assert.equal(escapeHTML("<img src=x>"), "&lt;img src=x&gt;"));
