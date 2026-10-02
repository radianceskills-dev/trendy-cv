const { chromium, expect } = require("@playwright/test");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
(async () => {
	const root = path.resolve(__dirname, "dist");
	const server = http.createServer((req, res) => {
		const name = new URL(req.url, "http://localhost").pathname.replace(/^\/tools\/cv-builder\//, "");
		const file = path.join(root, name || "index.html");
		if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
		res.setHeader(
			"Content-Type",
			/\.m?js$/.test(file) ? "application/javascript" : file.endsWith(".css") ? "text/css" : "text/html",
		);
		fs.createReadStream(file).pipe(res);
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
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
				JSON.stringify({ provider: "custom", endpoint: "https://mock.invalid/chat", apiKey: "test", model: "mock" }),
			),
		);
		let calls = 0;
		let invalid = false;
		let delay = false;
		await page.route("https://mock.invalid/chat", async (route) => {
			calls++;
			const input = JSON.parse(route.request().postDataJSON().messages[1].content);
			if (input.keywords) {
				assert(!JSON.stringify(input).includes("Pat Parsed"));
				assert(!Object.hasOwn(input, "cvText"));
				const section = input.sections[0];
				await route.fulfill({
					json: {
						choices: [
							{
								message: {
									content: JSON.stringify({
										changes: [
											{
												sectionId: section.id,
												entryId: section.items[0].id,
												field: "highlights",
												proposed: ["Developed reporting tools"],
												reason: "Clearer action verb",
												keywordIds: [input.keywords[0].id],
											},
										],
										gaps: [{ keywordId: input.keywords[0].id, question: "Can you describe a problem you solved?" }],
									}),
								},
							},
						],
					},
				});
				return;
			}
			if (input.cvText) {
				assert.equal(input.sections.length, 1);
				await route.fulfill({
					json: {
						choices: [
							{
								message: {
									content: JSON.stringify({
										header: { name: "Pat Parsed" },
										sections: [
											{
												id: input.sections[0].id,
												items: [
													{
														organization: "Parsed Company",
														role: "Engineer",
														startDate: "2020",
														current: true,
														highlights: ["Built reporting tools"],
													},
												],
											},
										],
									}),
								},
							},
						],
					},
				});
				return;
			}
			assert.deepEqual(input.target.industries, ["Technology"]);
			if (delay) await new Promise((r) => setTimeout(r, 700));
			await route.fulfill({
				json: {
					choices: [
						{
							message: {
								content: JSON.stringify({
									keywords: [
										{
											phrase: "Problem solving",
											category: "skill",
											priority: "high",
											source: "targetInference",
											evidence: "",
										},
									],
									sections: [
										{
											type: invalid ? "custom" : "experience",
											title: "Work Experience",
											rationale: "Relevant career evidence",
										},
									],
								}),
							},
						},
					],
				},
			});
		});
		await page.goto(`http://127.0.0.1:${server.address().port}/tools/cv-builder/`);
		await page.getByRole("button", { name: "Generate CV plan" }).click();
		await page.getByRole("alert").filter({ hasText: "at least one" }).waitFor();
		assert.equal(calls, 0);
		await page.getByLabel("Desired jobs / roles (required)").fill("Engineer");
		await page.getByRole("button", { name: "Generate CV plan" }).click();
		assert.equal(calls, 0);
		await page.getByLabel("Industries (required)").fill("Technology");
		invalid = true;
		await page.getByRole("button", { name: "Generate CV plan" }).click();
		await page.getByRole("alert").filter({ hasText: "Unknown or duplicate" }).waitFor();
		invalid = false;
		delay = true;
		await page.getByRole("button", { name: "Generate CV plan" }).click();
		await page.getByRole("button", { name: "Cancel planning" }).waitFor();
		await page.getByRole("button", { name: "AI generating — show output", exact: true }).click();
		await page.getByRole("region", { name: "AI generated text" }).waitFor();
		assert(await page.locator(".ai-float").evaluate((el) => el.classList.contains("generating")));
		await page.getByRole("button", { name: "Close AI output", exact: true }).click();
		await page.getByLabel("Specific job titles (optional)").fill("Senior engineer");
		await page.waitForTimeout(1000);
		assert.equal(await page.getByRole("heading", { name: "Review your CV plan" }).count(), 0);
		delay = false;
		await page.getByRole("button", { name: "Generate CV plan" }).click();
		await page.getByRole("button", { name: "Accept and save section plan" }).waitFor();
		await page.getByRole("button", { name: "Show AI output", exact: true }).click();
		assert((await page.locator(".ai-output pre").first().textContent()).includes("Problem solving"));
		await page.getByRole("button", { name: "Close AI output", exact: true }).click();
		assert((await page.locator("main").textContent()).includes("Inferred from your target"));
		await page.getByRole("button", { name: "Accept and save section plan" }).click();
		await page.getByRole("heading", { name: "Your fixed section plan" }).waitFor();
		await page.reload();
		await page.getByRole("heading", { name: "Your fixed section plan" }).waitFor();
		assert(await page.getByLabel("Desired jobs / roles (required)").isDisabled());
		const stored = await page.evaluate(
			() =>
				new Promise((resolve) => {
					const r = indexedDB.open("trendy-cv-planner", 1);
					r.onsuccess = () => {
						const q = r.result.transaction("drafts").objectStore("drafts").get("current");
						q.onsuccess = () => {
							resolve(q.result);
							r.result.close();
						};
					};
				}),
		);
		assert.equal(stored.sections[0].type, "experience");
		assert.deepEqual(stored.sections[0].items, []);
		await page.getByLabel("Name", { exact: true }).fill("Pat Manual");
		await page.getByRole("button", { name: "Add Work Experience entry", exact: true }).click();
		await page.getByLabel("Company / workplace (1)", { exact: true }).fill("Manual Company");
		await page.getByLabel("Start date (1)", { exact: true }).fill("2020-99");
		assert(await page.getByRole("button", { name: "My details are ready" }).isDisabled());
		await page.getByLabel("Start date (1)", { exact: true }).fill("2020");
		await page.getByRole("button", { name: "Add Work Experience entry", exact: true }).click();
		await page.getByLabel("Company / workplace (2)", { exact: true }).fill("Second Company");
		await page.getByRole("button", { name: "Move entry 2 up", exact: true }).click();
		assert.equal(await page.getByLabel("Company / workplace (1)", { exact: true }).inputValue(), "Second Company");
		await page.getByRole("button", { name: "Remove entry 1", exact: true }).click();
		await page.getByRole("button", { name: "Undo last removal", exact: true }).click();
		assert.equal(await page.getByLabel("Company / workplace (1)", { exact: true }).inputValue(), "Second Company");
		await page.getByText("Paste an existing CV", { exact: true }).click();
		await page
			.getByLabel("Existing CV text", { exact: true })
			.fill("Pat Parsed. Engineer at Parsed Company since 2020. Built reporting tools.");
		await page.getByRole("button", { name: "Extract into planned sections", exact: true }).click();
		await page.getByRole("button", { name: "Apply reviewed extraction", exact: true }).waitFor();
		assert.equal(await page.getByLabel("Name", { exact: true }).inputValue(), "Pat Manual");
		await page.getByRole("button", { name: "Apply reviewed extraction", exact: true }).click();
		assert.equal(await page.getByLabel("Name", { exact: true }).inputValue(), "Pat Parsed");
		assert.equal(await page.getByLabel("Company / workplace (1)", { exact: true }).inputValue(), "Parsed Company");
		assert.equal(await page.getByLabel("Company / workplace (2)", { exact: true }).count(), 0);
		await page.getByRole("button", { name: "My details are ready", exact: true }).click();
		await page.getByRole("status").filter({ hasText: "Facts confirmed and saved" }).waitFor();
		await page.getByRole("button", { name: "Optimize with AI", exact: true }).click();
		await page.getByRole("button", { name: "Accept suggestion", exact: true }).waitFor();
		assert.equal(
			await page.getByLabel("Responsibilities / achievements (1)", { exact: true }).inputValue(),
			"Built reporting tools",
		);
		await page.getByRole("button", { name: "Accept suggestion", exact: true }).click();
		await expect(page.getByLabel("Responsibilities / achievements (1)", { exact: true })).toHaveValue(
			"Developed reporting tools",
		);
		await page.getByRole("button", { name: "Finish review / keep current wording", exact: true }).click();
		await page.getByRole("status").filter({ hasText: "Wording review finished" }).waitFor();
		await page.reload();
		await page.getByRole("status").filter({ hasText: "Facts confirmed and saved" }).waitFor();
		assert.equal(await page.getByLabel("Name", { exact: true }).inputValue(), "Pat Parsed");
		await page.getByLabel("Name", { exact: true }).fill("Pat Final");
		assert.equal(await page.getByRole("status").filter({ hasText: "Facts confirmed and saved" }).count(), 0);
		const png = await page.evaluate(() => {
			const c = document.createElement("canvas");
			c.width = 120;
			c.height = 160;
			const ctx = c.getContext("2d");
			ctx.fillStyle = "#276b89";
			ctx.fillRect(0, 0, 120, 160);
			return c.toDataURL("image/png").split(",")[1];
		});
		await page
			.getByLabel("Upload or replace photo", { exact: true })
			.setInputFiles({ name: "portrait.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
		await page.getByRole("button", { name: "Save cropped photo", exact: true }).click();
		await page.getByRole("status").filter({ hasText: "Photo saved locally" }).waitFor();
		await page.reload();
		await page.getByAltText("Saved CV portrait").waitFor();
		assert.equal(await page.getByAltText("Saved CV portrait").evaluate((img) => img.naturalWidth), 600);
		await page.getByRole("button", { name: "My details are ready", exact: true }).click();
		for (const name of ["Studio", "Chronicle", "Precision", "Blueprint", "Scholar"]) {
			await page.getByRole("button", { name: new RegExp(`^${name} `) }).click();
			await page.getByText(new RegExp(`verified PDF pages · ${name}`)).waitFor({ timeout: 60000 });
			await page.getByRole("status").filter({ hasText: "1 page · PDF preview" }).waitFor({ timeout: 60000 });
			assert((await page.locator(".pdf-pages").textContent()).includes("Parsed Company"));
		}
		await page.getByRole("button", { name: "Save CV & download PDF", exact: true }).click();
		await page.getByLabel("CV name", { exact: true }).fill("Engineering CV");
		const downloaded = page.waitForEvent("download");
		await page.getByRole("button", { name: "Save named CV", exact: true }).click();
		const file = await downloaded;
		assert.equal(file.suggestedFilename(), "Engineering CV.pdf");
		assert(
			fs
				.readFileSync(await file.path())
				.subarray(0, 5)
				.toString() === "%PDF-",
		);
		await page.getByRole("button", { name: "Remove photo", exact: true }).click();
		await page.getByRole("status").filter({ hasText: "Photo removed" }).waitFor();
		await page.reload();
		await page.getByLabel("Upload or replace photo", { exact: true }).waitFor();
		assert.equal(await page.getByAltText("Saved CV portrait").count(), 0);
		await page.getByText("Saved CVs in this browser (1)", { exact: true }).click();
		await page.getByRole("button", { name: "Open Engineering CV", exact: true }).click();
		await page.getByAltText("Saved CV portrait").waitFor();
		await page.getByText("1 verified PDF pages · Scholar", { exact: true }).waitFor({ timeout: 60000 });
		assert.deepEqual(errors, []);
		console.log(
			"PASS target requirements, invalid plans, stale response cancellation, acceptance and fixed-plan reload",
		);
	} finally {
		await browser?.close();
		server.close();
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
