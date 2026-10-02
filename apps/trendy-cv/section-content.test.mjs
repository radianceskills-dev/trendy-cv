import assert from "node:assert/strict";
import test from "node:test";
import { applyExtraction, restoreLegacySections, stageExtraction } from "./src/section-content.mjs";
import { acceptPlan, newDraft, targetKey, validateDraft, validatePlan } from "./src/target-plan.mjs";

const target = { desiredJobs: ["Engineer"], industries: ["Technology"], jobTitles: [], jobDescription: "" };
const make = () =>
	acceptPlan({
		...newDraft(target),
		planTargetKey: targetKey(target),
		plan: validatePlan(
			{
				keywords: [
					{ phrase: "Engineering", category: "domain", priority: "high", source: "targetInference", evidence: "" },
				],
				sections: [{ type: "experience", title: "Work Experience", rationale: "Relevant work" }],
			},
			target,
		),
	});
test("extraction is staged, replaces rather than duplicates, and detects stale data", () => {
	const draft = make();
	const raw = {
		header: { name: "Pat" },
		sections: [{ id: draft.sections[0].id, items: [{ organization: "Example", role: "Engineer" }] }],
	};
	const stage = stageExtraction(raw, draft, () => "entry-1");
	assert.equal(draft.sections[0].items.length, 0);
	const applied = applyExtraction(draft, stage);
	assert.equal(applied.sections[0].items.length, 1);
	assert.equal(
		applyExtraction(
			applied,
			stageExtraction(raw, applied, () => "entry-2"),
		).sections[0].items.length,
		1,
	);
	assert.throws(() => applyExtraction({ ...draft, rawText: "new" }, stage));
});
test("unknown sections, invented fields, IDs and invalid dates rejected", () => {
	const draft = make();
	for (const item of [{ id: "injected" }, { madeUp: "field" }, { startDate: "2020-99" }])
		assert.throws(() =>
			stageExtraction({ header: {}, sections: [{ id: draft.sections[0].id, items: [item] }] }, draft),
		);
	assert.throws(() => stageExtraction({ header: {}, sections: [{ id: "other", items: [] }] }, draft));
});
test("version 2 accepted draft upgrades with content defaults", () => {
	const draft = make();
	delete draft.rawText;
	delete draft.factsConfirmed;
	draft.schemaVersion = 2;
	assert.equal(validateDraft(draft).schemaVersion, 4);
	assert.equal(validateDraft(draft).factsConfirmed, false);
});
test("legacy structured facts map once into empty sections, retain original wording", () => {
	const draft = make();
	draft.legacyBackup = {
		cv: { experience: "original" },
		entries: {
			experience: {
				source: "original",
				items: [{ company: "Acme", position: "Engineer", period: "Summer 2020", description: "Built services" }],
			},
		},
	};
	const restored = restoreLegacySections(draft, () => "restored");
	assert.equal(restored.sections[0].items[0].organization, "Acme");
	assert.equal(restored.sections[0].items[0].originalDateLabel, "Summer 2020");
	assert.deepEqual(restoreLegacySections(restored), restored);
});
