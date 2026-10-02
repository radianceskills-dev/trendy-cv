import assert from "node:assert/strict";
import test from "node:test";
import { emptyEntry, toResumeData, validateEntries } from "./src/resume-adapter.mjs";
import { emptyCV } from "./src/wizard-model.mjs";

const defaults = {
	basics: {},
	picture: {},
	summary: {},
	sections: Object.fromEntries(["experience", "education", "skills", "projects"].map((key) => [key, { items: [] }])),
	metadata: { page: {}, design: { colors: {} }, typography: { body: {}, heading: {} }, layout: {} },
};
const options = { template: "azurill", paper: "a4", theme: "Arctic", skills: [] };
test("legacy drafts retain text, escape markup, and omit empty sections/sidebar", () => {
	const cv = { ...emptyCV(), experience: "A < B\nsecond line" };
	const data = toResumeData(defaults, cv, options);
	assert.equal(data.sections.experience.items[0].description, "A &lt; B<br>second line");
	assert.equal(data.sections.education.hidden, true);
	assert.deepEqual(data.metadata.layout.pages, [{ fullWidth: true, main: ["experience"], sidebar: [] }]);
	assert.equal(defaults.sections.experience.items.length, 0);
});
test("structured rows map to native fields and literal safe bullet text", () => {
	const cv = { ...emptyCV(), experience: "original" };
	const entries = {
		experience: {
			source: "original",
			items: [
				{
					...emptyEntry("experience"),
					company: "Acme",
					position: "Engineer",
					period: "2020–2026",
					description: "First\n<script>",
				},
			],
		},
	};
	const data = toResumeData(defaults, cv, options, validateEntries(entries));
	assert.equal(data.sections.experience.items[0].company, "Acme");
	assert.equal(data.sections.experience.items[0].description, "<ul><li>First</li><li>&lt;script&gt;</li></ul>");
});
test("changed source invalidates presentation overrides without deleting them", () => {
	const entries = { experience: { source: "old", items: [{ ...emptyEntry("experience"), company: "Old employer" }] } };
	const data = toResumeData(defaults, { ...emptyCV(), experience: "New confirmed history" }, options, entries);
	assert.equal(data.sections.experience.items[0].description, "New confirmed history");
	assert.equal(entries.experience.items[0].company, "Old employer");
});
test("missing legacy structure is accepted, malformed saved structure is rejected", () => {
	assert.deepEqual(validateEntries(undefined), {});
	assert.throws(() => validateEntries({ education: { source: "", items: [{ school: 42 }] } }));
});
