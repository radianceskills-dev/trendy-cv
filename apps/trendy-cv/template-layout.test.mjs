import assert from "node:assert/strict";
import test from "node:test";
import { contentPages, hasContent } from "./src/template-layout.mjs";

test("whitespace is not content", () => {
	for (const v of [null, undefined, "", " \n\t"]) assert.equal(hasContent(v), false);
	assert(hasContent("SQL"));
});
test("empty sections and sidebars disappear", () =>
	assert.deepEqual(contentPages({ experience: "Engineer", education: " " }, [" "], "advanced"), [
		{ fullWidth: true, main: ["experience"], sidebar: [] },
	]));
test("empty continuation pages are removed", () =>
	assert.deepEqual(contentPages({ summary: "Profile" }, [], "multipage"), [
		{ fullWidth: true, main: ["summary"], sidebar: [] },
	]));
test("populated second page survives", () =>
	assert.equal(contentPages({ summary: "Profile", education: "Degree" }, ["SQL"], "multipage").length, 2));
test("contact-only CV retains one page", () =>
	assert.deepEqual(contentPages({}, [], "multipage"), [{ fullWidth: true, main: [], sidebar: [] }]));
