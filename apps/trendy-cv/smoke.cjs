const { chromium } = require("@playwright/test");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
(async () => {
	const root = path.resolve(__dirname, "dist");
	const server = http.createServer((req, res) => {
		const p = new URL(req.url, "http://localhost").pathname.replace(/^\/tools\/cv-builder\//, "");
		const file = path.join(root, p || "index.html");
		if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
			res.writeHead(404).end();
			return;
		}
		res.setHeader(
			"Content-Type",
			/\.(m?js)$/.test(file) ? "application/javascript" : file.endsWith(".css") ? "text/css" : "text/html",
		);
		fs.createReadStream(file).pipe(res);
	});
	await new Promise((r) => server.listen(0, "127.0.0.1", r));
	let browser;
	try {
		browser = await chromium.launch({
			executablePath: process.env.CHROME_BIN || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
			headless: true,
		});
		const page = await browser.newPage();
		const errors = [];
		page.on("pageerror", (e) => errors.push(e.message));
		await page.addInitScript(() =>
			localStorage.setItem(
				"trendytools.ai.v1",
				JSON.stringify({
					provider: "custom",
					transport: "openai",
					endpoint: "https://mock.invalid/chat/completions",
					apiKey: "test",
					model: "mock",
				}),
			),
		);
		const requests = [];
		await page.route("https://mock.invalid/chat/completions", async (route) => {
			const body = route.request().postDataJSON();
			requests.push(body);
			const prompt = body.messages[0].content;
			let result;
			if (prompt.startsWith("Structure job"))
				result = {
					roles: ["Engineer"],
					titles: ["Software engineer"],
					industries: ["Technology"],
					keywords: ["SQL"],
					inferred: ["SQL"],
					questions: [],
				};
			else if (prompt.startsWith("Extract"))
				result = {
					name: "Pat Example",
					email: "pat@example.com",
					phone: "",
					location: "",
					headline: "Engineer",
					summary: "Builds software",
					experience: "Engineer at Example Co",
					education: "",
					skills: ["Python"],
					additional: "",
				};
			else if (prompt.startsWith("Review"))
				result = {
					suggestions: [
						{
							field: "skills",
							reason: "Clarify database skills",
							question: "Do you know SQL?",
							proposed: ["Python", "SQL"],
						},
					],
				};
			else if (prompt.startsWith("Optimize")) result = { skillGroups: [[1, 0]], note: "Grouped confirmed skills" };
			else throw Error("Unexpected request");
			// Exercise repair in target, extraction, review, and optimization requests.
			const malformed = prompt.startsWith("Review")
				? "changes:\n  - field: skills\n    action: suggest_add\n    proposed: SQL\n    reason: Relevant\n    question: Do you know SQL?"
				: `\`\`\`json\n${JSON.stringify(result).replace(/}$/, ",}")}\n\`\`\``;
			await route.fulfill({ json: { choices: [{ message: { content: malformed } }] } });
		});
		await page.goto(`http://127.0.0.1:${server.address().port}/tools/cv-builder/?legacy`);
		await page.getByLabel("Roles you are interested in").fill("Engineer");
		await page.getByRole("button", { name: "Next: Your CV" }).click();
		await page.getByLabel("Full name", { exact: true }).fill("Alex Private");
		await page.getByLabel("Email", { exact: true }).fill("private@example.com");
		await page.getByLabel("Skills (one per line)").fill("Python");
		await page.getByRole("button", { name: "Review with AI", exact: true }).click();
		await page.getByRole("button", { name: "Accept skills", exact: true }).waitFor();
		assert(!JSON.stringify(requests[1]).includes("private@example.com"));
		assert(!JSON.stringify(requests[1]).includes("Alex Private"));
		assert(await page.getByRole("button", { name: "Content confirmed: Choose format" }).isDisabled());
		await page.getByRole("button", { name: "Accept skills", exact: true }).click();
		await page.getByRole("button", { name: "Content confirmed: Choose format" }).click();
		await page.getByRole("button", { name: "Group skills with AI & create CV" }).click();
		await page.getByText("Personal details and content", { exact: true }).click();
		assert.equal(await page.getByLabel("Displayed skills").inputValue(), "SQL · Python");
		await page.getByRole("textbox", { name: "Edit name", exact: true }).fill("Alex Edited");
		await page.getByRole("heading", { name: "Your CV is ready to edit" }).click();
		await page.getByRole("status").filter({ hasText: "1 page · PDF preview" }).waitFor({ timeout: 60000 });
		assert((await page.locator(".pdf-page").textContent()).includes("Alex Edited"));
		for (const heading of ["Experience", "Education", "Additional information"])
			assert(!(await page.locator(".pdf-page").textContent()).includes(heading));
		const downloaded = page.waitForEvent("download");
		await page.getByRole("button", { name: "Export PDF", exact: true }).click();
		const file = await downloaded;
		assert.equal(file.suggestedFilename(), "trendy-cv.pdf");
		const previewBytes = await page.evaluate(
			async (url) => Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())),
			file.url(),
		);
		assert.deepEqual(Array.from(fs.readFileSync(await file.path())), previewBytes);
		assert.deepEqual(errors, []);
		console.log("PASS wizard: background target, form review, approval, skill grouping, edited PDF preview and export");
		await page.reload();
		await page.getByRole("button", { name: "Next: Your CV" }).click();
		await page.getByLabel("How will you provide your CV?").selectOption("text");
		await page.getByLabel("Paste CV text").fill("Pat Example, pat@example.com. Engineer at Example Co. Python.");
		const reviewsBefore = requests.filter((r) => r.messages[0].content.startsWith("Review")).length;
		await page.getByRole("button", { name: "Fill my details" }).click();
		await page.getByRole("button", { name: "Review with AI", exact: true }).waitFor();
		assert.equal(await page.getByLabel("Full name", { exact: true }).inputValue(), "Pat Example");
		assert.equal(requests.filter((r) => r.messages[0].content.startsWith("Review")).length, reviewsBefore);
		await page.getByRole("button", { name: "Review with AI", exact: true }).click();
		await page.getByRole("button", { name: "Keep current skills" }).click();
		await page.getByRole("button", { name: "Content confirmed: Choose format" }).click();
		await page.getByRole("button", { name: /Multi-page/ }).click();
		await page.getByRole("button", { name: "Group skills with AI & create CV" }).click();
		// The mock intentionally references an unavailable skill for this CV; validation must block preview.
		await page.getByRole("alert").filter({ hasText: "unknown or duplicate skill" }).waitFor();
		console.log("PASS pasted CV extraction, dismissal, invalid optimization blocked");
		await page.getByRole("button", { name: "Create my CV", exact: true }).click();
		await page.getByRole("status").filter({ hasText: "1 page · PDF preview" }).waitFor({ timeout: 60000 });
		assert((await page.locator(".pdf-page").textContent()).includes("Engineer at Example Co"));
		await page.getByText("Structure experience", { exact: true }).click();
		await page.getByRole("button", { name: "Add experience entry" }).click();
		await page.getByLabel("experience 1 Employer", { exact: true }).fill("Example Co");
		await page.getByLabel("experience 1 Role", { exact: true }).fill("Engineer");
		await page.getByLabel("experience 1 Dates", { exact: true }).fill("2020–2026");
		await page
			.getByLabel("experience 1 Achievements (one per line)", { exact: true })
			.fill(
				Array.from(
					{ length: 45 },
					(_, i) => `Achievement ${i + 1}: delivered a documented software improvement for the operations team.`,
				).join("\n"),
			);
		for (const template of ["onyx", "azurill", "bronzor"]) {
			await page.getByLabel("Template", { exact: true }).selectOption(template);
			await page
				.getByRole("status")
				.filter({ hasText: /\d+ pages · PDF preview/ })
				.waitFor({ timeout: 60000 });
			const text = await page.locator(".pdf-pages").textContent();
			assert(text.includes("Achievement 45"), `${template}: final content lost`);
			assert(text.includes("Example Co"));
			assert((await page.locator(".pdf-page canvas").count()) > 1);
			if (process.env.CV_ARTIFACT_DIR) {
				const directory = process.env.CV_ARTIFACT_DIR;
				assert(fs.statSync(directory).isDirectory(), "Artifact directory must already exist");
				const canvases = page.locator(".pdf-page canvas");
				for (let i = 0; i < (await canvases.count()); i++) {
					await canvases.nth(i).screenshot({ path: path.join(directory, `${template}-page-${i + 1}.png`) });
				}
				const download = page.waitForEvent("download");
				await page.getByRole("button", { name: "Export PDF", exact: true }).click();
				await (await download).saveAs(path.join(directory, `${template}.pdf`));
			}
		}
		await page.getByLabel("Paper", { exact: true }).selectOption("letter");
		await page
			.getByRole("status")
			.filter({ hasText: /\d+ pages · PDF preview/ })
			.waitFor({ timeout: 60000 });
		await page.setViewportSize({ width: 390, height: 844 });
		assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
		await page.waitForTimeout(700);
		await page.reload();
		await page.getByRole("button", { name: "Next: Your CV" }).click();
		await page.getByRole("button", { name: "Skip review: Choose format" }).click();
		await page.getByRole("button", { name: "Create my CV", exact: true }).click();
		await page
			.getByRole("status")
			.filter({ hasText: /\d+ pages · PDF preview/ })
			.waitFor({ timeout: 60000 });
		assert.equal(await page.getByLabel("Template", { exact: true }).inputValue(), "bronzor");
		assert.equal(await page.getByLabel("Paper", { exact: true }).inputValue(), "letter");
		assert((await page.locator(".pdf-pages").textContent()).includes("Achievement 45"));
		assert.deepEqual(errors, []);
		console.log(
			"PASS three real templates, multi-page content preservation, mobile width, structured draft restoration",
		);
	} finally {
		await browser?.close();
		server.close();
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
