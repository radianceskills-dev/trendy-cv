type Payload = { choices?: { message?: { content?: string } }[]; message?: { content?: string } };
type PuterWindow = Window & {
	puter?: {
		ai: {
			chat: (
				messages: { role: string; content: string }[],
				options: { model: string; normalize: boolean },
			) => Promise<Payload | string>;
		};
	};
};
export function settings() {
	const s = JSON.parse(localStorage.getItem("trendytools.ai.v1") || "null");
	if (s?.provider === "puter" && s.transport === "puter") return s;
	if (!s?.apiKey?.trim() || !s?.model?.trim()) throw Error("Configure AI on the Trendy Tools dashboard first.");
	const endpoints = {
		openrouter: "https://openrouter.ai/api/v1/chat/completions",
		bai: "https://api.b.ai/v1/chat/completions",
	};
	const endpoint = endpoints[s.provider] || (s.provider === "custom" ? s.endpoint : null);
	if (!endpoint || new URL(endpoint).protocol !== "https:") throw Error("An HTTPS AI endpoint is required.");
	return { ...s, endpoint };
}
export async function rewrite(text: string, instruction: string, signal: AbortSignal): Promise<string> {
	const s = settings();
	const messages = [
		{
			role: "system",
			content:
				'Edit only the supplied CV text. Preserve facts. Never invent employers, qualifications, achievements, dates, numbers, metrics, or skills. If information is missing, preserve the original meaning. Return raw JSON only: {"text":"revised plain text"}. No HTML or Markdown fences.',
		},
		{ role: "user", content: JSON.stringify({ instruction, text }) },
	];
	let payload: Payload | string;
	const browser = window as PuterWindow;
	if (s.transport === "puter") {
		if (!browser.puter)
			await new Promise<void>((resolve, reject) => {
				const script = document.createElement("script");
				script.src = "https://js.puter.com/v2/";
				script.onload = () => resolve();
				script.onerror = () => reject(Error("Cannot load Puter"));
				document.head.appendChild(script);
			});
		if (!browser.puter) throw Error("Puter did not initialize");
		payload = await browser.puter.ai.chat(messages, { model: s.model || "gpt-5-nano", normalize: true });
	} else {
		const r = await fetch(s.endpoint, {
			method: "POST",
			headers: { Authorization: `Bearer ${s.apiKey}`, "Content-Type": "application/json" },
			body: JSON.stringify({ model: s.model, messages, temperature: 0.1 }),
			signal,
		});
		if (!r.ok) throw Error(`AI request failed (${r.status})`);
		payload = await r.json();
	}
	if (signal.aborted) throw Error("Cancelled");
	const content =
		typeof payload === "string" ? payload : (payload?.choices?.[0]?.message?.content ?? payload?.message?.content);
	if (!content) throw Error("AI returned no text");
	const result = JSON.parse(content);
	if (
		!result ||
		Object.keys(result).some((k) => k !== "text") ||
		typeof result.text !== "string" ||
		!result.text.trim() ||
		result.text.length > 12000
	)
		throw Error("AI returned an invalid text proposal.");
	return result.text;
}
