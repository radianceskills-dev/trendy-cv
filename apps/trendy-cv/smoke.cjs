const { chromium } = require("@playwright/test");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
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
			file.endsWith(".js") ? "application/javascript" : file.endsWith(".css") ? "text/css" : "text/html",
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
		await page.goto(`http://127.0.0.1:${server.address().port}/tools/cv-builder/`);
		await page.getByLabel("Name", { exact: true }).fill("Alex Example");
		await page.getByRole("button", { name: "Refresh preview" }).click();
		await page.getByRole("link", { name: "Download PDF" }).waitFor({ timeout: 60000 });
		await page.reload();
		await page.getByLabel("Name", { exact: true }).waitFor();
		await page.waitForFunction(() =>
			Array.from(document.querySelectorAll("input")).some((el) => el.value === "Alex Example"),
		);
		if (errors.length) throw Error(errors.join("\n"));
		await page.getByRole("button", { name: "Summary", exact: true }).click();
		await page.getByLabel("Summary", { exact: true }).fill("I maintain hospital systems.");
		await page.evaluate(() =>
			localStorage.setItem(
				"trendytools.ai.v1",
				JSON.stringify({
					provider: "custom",
					transport: "openai",
					endpoint: "https://mock.invalid/v1/chat/completions",
					model: "mock",
					apiKey: "test",
				}),
			),
		);
		let body;
		await page.route("https://mock.invalid/v1/chat/completions", async (route) => {
			body = route.request().postData();
			await route.fulfill({
				json: { choices: [{ message: { content: JSON.stringify({ text: "Maintained hospital systems." }) } }] },
			});
		});
		await page.getByRole("button", { name: "Improve selected text with AI" }).click();
		await page.getByRole("button", { name: "Send selected text and propose edit" }).click();
		await page.getByRole("button", { name: "Accept this edit" }).waitFor();
		if (body.includes("Alex Example")) throw Error("Unselected name entered AI request");
		if ((await page.locator(".editor textarea").inputValue()) !== "I maintain hospital systems.")
			throw Error("AI applied before review");
		await page.getByRole("button", { name: "Accept this edit" }).click();
		if ((await page.locator(".editor textarea").inputValue()) !== "Maintained hospital systems.")
			throw Error("Accept failed");
		await page.getByLabel("Template family").selectOption("multipage");
		await page.getByRole("button", { name: "Refresh preview" }).click();
		await page.getByRole("link", { name: "Download PDF" }).waitFor({ timeout: 60000 });
		console.log("PASS: standalone editor, PDF export, IndexedDB restore");
		console.log("PASS: selected-text AI privacy, review/accept, multi-page PDF generation");
	} finally {
		await browser?.close();
		server.close();
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
