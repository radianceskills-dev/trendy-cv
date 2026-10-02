import assert from "node:assert/strict";
import test from "node:test";
import { entryBlocks, pdfFileName, TEMPLATE_CATALOG, templateEligibility } from "./src/template-catalog.mjs";

test("five families filter populated counts rather than empty planned sections", () => {
	assert.equal(Object.keys(TEMPLATE_CATALOG).length, 5);
	const draft = {
		sections: Array.from({ length: 12 }, (_, i) => ({
			type: "experience",
			hidden: false,
			items: i < 9 ? [{ id: String(i), description: "Work" }] : [],
		})),
	};
	assert(!templateEligibility(draft, "studio").eligible);
	assert(templateEligibility(draft, "precision").eligible);
});
test("entry projection preserves specialized fields, zero amounts and literal text", () => {
	const item = {
		id: "1",
		projectTitle: "Study",
		funder: "Foundation",
		totalAmount: 0,
		currency: "GBP",
		status: "pending",
		description: "A < B",
		links: ["https://example.com"],
	};
	const result = entryBlocks("funding", item);
	assert(result.title.includes("Study"));
	for (const value of ["0", "GBP", "pending", "A < B", "https://example.com"])
		assert(result.lines.some((line) => line.text === value));
	assert(!result.lines.some((line) => line.text === "1"));
});
test("download filename sanitizes unsafe characters", () => {
	assert.equal(pdfFileName("My/CV:*"), "My-CV--.pdf");
});
