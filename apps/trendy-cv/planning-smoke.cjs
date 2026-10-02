const { chromium } = require("@playwright/test");
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
		await page.getByLabel("Specific job titles (optional)").fill("Senior engineer");
		await page.waitForTimeout(1000);
		assert.equal(await page.getByRole("heading", { name: "Review your CV plan" }).count(), 0);
		delay = false;
		await page.getByRole("button", { name: "Generate CV plan" }).click();
		await page.getByRole("button", { name: "Accept and save section plan" }).waitFor();
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
