import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// Run against smoke.cjs artifacts, not user documents. Checks geometry and
// content preservation; does not claim visual approval or ATS compatibility.
const directory = process.argv[2];
if (!directory) throw Error("Usage: node apps/trendy-cv/audit-pdfs.mjs <artifact-directory>");
for (const template of ["onyx", "azurill", "bronzor"]) {
	const task = getDocument({ data: new Uint8Array(await readFile(path.join(directory, `${template}.pdf`))) });
	try {
		const pdf = await task.promise;
		const texts = [];
		for (let n = 1; n <= pdf.numPages; n++) {
			const page = await pdf.getPage(n);
			const [left, bottom, right, top] = page.view;
			const { items } = await page.getTextContent();
			const textItems = items.filter((item) => "str" in item && item.str.trim());
			assert(textItems.length, `${template} page ${n}: blank page`);
			for (const item of textItems) {
				const x = item.transform[4];
				const y = item.transform[5];
				assert(
					x >= left - 1 && x + item.width <= right + 1,
					`${template} page ${n}: text crosses horizontal page boundary`,
				);
				assert(y >= bottom - 1 && y <= top + 1, `${template} page ${n}: text baseline crosses vertical page boundary`);
			}
			texts.push(textItems.map((item) => item.str).join(" "));
		}
		const text = texts.join(" ");
		for (let i = 1; i <= 45; i++) {
			assert.equal(
				text.match(new RegExp(`Achievement ${i}:`, "g"))?.length,
				1,
				`${template}: achievement ${i} missing or duplicated`,
			);
		}
		console.log(`PASS ${template}: ${pdf.numPages} nonblank pages, all 45 achievements once, text within page bounds`);
	} finally {
		await task.destroy();
	}
}
