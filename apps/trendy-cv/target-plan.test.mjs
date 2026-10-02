import assert from "node:assert/strict";
import test from "node:test";
import {
	hasEntryContent,
	PLANNABLE_TYPES,
	SECTION_TYPES,
	validateDate,
	validateEntry,
	visibleSections,
} from "./src/section-model.mjs";
import {
	acceptPlan,
	migrateLegacy,
	newDraft,
	normalizeTarget,
	targetKey,
	validateDraft,
	validatePlan,
} from "./src/target-plan.mjs";

const target = {
	desiredJobs: ["Engineer"],
	industries: ["Technology"],
	jobTitles: [],
	jobDescription: "Build Python services",
};
const response = () => ({
	keywords: [{ phrase: "Python", category: "skill", priority: "high", source: "jobDescription", evidence: "Python" }],
	sections: [{ type: "experience", title: "Work Experience", rationale: "Show relevant work." }],
});
test("required target lists are normalized and deduplicated", () => {
	assert.throws(() => normalizeTarget({ ...target, industries: [" "] }));
	assert.throws(() => normalizeTarget({ ...target, desiredJobs: [] }));
	assert.equal(normalizeTarget({ ...target, desiredJobs: [" Engineer ", "engineer"] }).desiredJobs.length, 1);
});
test("plans reject unknown, custom, duplicate types, unsupported titles and false JD quotes", () => {
	for (const type of ["custom", "unknown"]) {
		const p = response();
		p.sections[0].type = type;
		assert.throws(() => validatePlan(p, target));
	}
	const duplicate = response();
	duplicate.sections.push(duplicate.sections[0]);
	assert.throws(() => validatePlan(duplicate, target));
	const title = response();
	title.sections[0].title = "Invented";
	assert.throws(() => validatePlan(title, target));
	const quote = response();
	quote.keywords[0].evidence = "Java";
	assert.throws(() => validatePlan(quote, target));
});
test("all standard types initialize typed entries and reject invalid fields", () => {
	assert.equal(PLANNABLE_TYPES.length, 15);
	for (const type of PLANNABLE_TYPES) {
		const fields = Object.fromEntries(
			Object.entries(SECTION_TYPES[type].fields).map(([key, kind]) => [
				key,
				kind === "boolean" ? false : kind === "number" ? 0 : kind === "list" ? [] : "",
			]),
		);
		assert.equal(validateEntry(type, { id: type, ...fields }).id, type);
		assert.throws(() => validateEntry(type, { id: type, invented: "x" }));
	}
});
test("meaningful content ignores IDs and flags but preserves numeric zero", () => {
	assert.equal(hasEntryContent({ id: "1", current: true, description: " ", highlights: [] }), false);
	assert.equal(hasEntryContent({ id: "1", totalAmount: 0 }), true);
	assert.deepEqual(visibleSections([{ hidden: false, items: [{ id: "1" }] }]), []);
});
test("date precision and impossible/reversed dates", () => {
	for (const date of ["2020", "2020-02", "2020-02-29"]) assert.equal(validateDate(date), date);
	assert.throws(() => validateDate("2021-02-29"));
	assert.throws(() => validateEntry("experience", { id: "1", startDate: "2022", endDate: "2020" }));
});
test("accepted plan initializes fixed empty sections and survives roundtrip", () => {
	const draft = { ...newDraft(target), plan: validatePlan(response(), target), planTargetKey: targetKey(target) };
	const accepted = acceptPlan(draft);
	assert.equal(accepted.sections.length, 1);
	assert.deepEqual(validateDraft(accepted), accepted);
	assert.throws(() => acceptPlan({ ...draft, target: { ...target, industries: ["Finance"] } }));
	assert.throws(() => validateDraft({ ...accepted, sections: [] }));
	assert.throws(() => validateDraft({ ...accepted, schemaVersion: 999 }));
});
test("legacy data is preserved without invented plan or structure", () => {
	const old = {
		roles: "Engineer",
		cv: { name: "Pat", experience: "Original facts" },
		entries: { experience: { items: [] } },
	};
	const draft = migrateLegacy(old);
	assert.deepEqual(draft.legacyBackup, old);
	assert.equal(draft.plan, null);
	assert.equal(draft.header.name, "Pat");
	assert.deepEqual(draft.target.industries, []);
	assert.deepEqual(validateDraft(draft), draft);
});
