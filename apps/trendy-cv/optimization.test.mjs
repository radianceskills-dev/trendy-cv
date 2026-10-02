import assert from "node:assert/strict";
import test from "node:test";
import {
	applyOptimizationChange,
	optimizationInput,
	optimizationKey,
	validateOptimizationReview,
} from "./src/optimization.mjs";
import { acceptPlan, newDraft, targetKey, validatePlan } from "./src/target-plan.mjs";

function fixture() {
	const target = { desiredJobs: ["Engineer"], industries: ["Tech"], jobTitles: [], jobDescription: "" };
	const draft = acceptPlan({
		...newDraft(target),
		planTargetKey: targetKey(target),
		plan: validatePlan(
			{
				keywords: [
					{ phrase: "Reporting", category: "skill", priority: "high", source: "targetInference", evidence: "" },
				],
				sections: [{ type: "experience", title: "Work Experience", rationale: "Work" }],
			},
			target,
		),
	});
	draft.factsConfirmed = true;
	draft.header.name = "PRIVATE";
	draft.header.email = "secret@example.com";
	draft.rawText = "PRIVATE RAW";
	draft.sections[0].items = [
		{
			id: "job",
			organization: "Employer",
			startDate: "2020",
			description: "Built reports",
			highlights: ["Maintained tools"],
		},
	];
	return draft;
}
const response = () => ({
	changes: [
		{
			sectionId: "section-1",
			entryId: "job",
			field: "description",
			proposed: "Developed reporting tools",
			reason: "Clearer wording",
			keywordIds: ["keyword-1"],
		},
	],
	gaps: [],
});
test("input excludes identity, raw text and factual metadata", () => {
	const input = JSON.stringify(optimizationInput(fixture()));
	for (const secret of ["PRIVATE", "secret@example.com", "Employer", "2020"]) assert(!input.includes(secret));
	assert(input.includes("Built reports"));
});
test("accepted wording changes preserve facts and reject stale snapshots", () => {
	const draft = fixture();
	const review = validateOptimizationReview(response(), draft);
	const next = applyOptimizationChange(draft, review.changes[0], review.before);
	assert.equal(next.sections[0].items[0].organization, "Employer");
	assert.equal(next.sections[0].items[0].description, "Developed reporting tools");
	assert.throws(() => applyOptimizationChange(next, review.changes[0], review.before));
});
test("forbidden fields, invented numbers, missing entries and unknown keywords rejected", () => {
	for (const patch of [
		{ field: "organization" },
		{ proposed: "Improved speed 50%" },
		{ entryId: "missing" },
		{ keywordIds: ["unknown"] },
	]) {
		const raw = response();
		Object.assign(raw.changes[0], patch);
		assert.throws(() => validateOptimizationReview(raw, fixture()));
	}
});
test("preserve bullet count, allow questions without inserting claims", () => {
	const draft = fixture();
	const raw = response();
	raw.changes[0].field = "highlights";
	raw.changes[0].proposed = [];
	assert.throws(() => validateOptimizationReview(raw, draft));
	const before = optimizationKey(draft);
	assert.equal(
		validateOptimizationReview(
			{ changes: [], gaps: [{ keywordId: "keyword-1", question: "Which reporting tools have you used?" }] },
			draft,
		).gaps.length,
		1,
	);
	assert.equal(optimizationKey(draft), before);
});
