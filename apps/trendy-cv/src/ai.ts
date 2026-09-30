import { parseAIJSON, withDeadline } from "./ai-json.mjs";
import { parseReviewYAML } from "./review.mjs";

type Payload = {
	choices?: { finish_reason?: string; message?: { content?: string } }[];
	message?: { content?: string };
};
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
export function requestJSON(system: string, input: unknown, signal: AbortSignal): Promise<unknown> {
	return withDeadline(
		async (requestSignal: AbortSignal) => parseAIJSON(await requestText(system, input, requestSignal)),
		signal,
	);
}

export function requestReview(system: string, input: unknown, signal: AbortSignal): Promise<unknown> {
	return withDeadline(
		async (requestSignal: AbortSignal) => parseReviewYAML(await requestText(system, input, requestSignal)),
		signal,
	);
}

async function requestText(system: string, input: unknown, signal: AbortSignal): Promise<string> {
	const s = settings();
	const messages = [
		{
			role: "system",
			content: system,
		},
		{ role: "user", content: JSON.stringify(input) },
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
	if (typeof payload !== "string" && payload?.choices?.[0]?.finish_reason === "length") {
		throw Error("AI output was cut off. Shorten the CV text or choose a model with a larger output limit, then retry.");
	}
	const content =
		typeof payload === "string" ? payload : (payload?.choices?.[0]?.message?.content ?? payload?.message?.content);
	if (typeof content !== "string" || !content.trim()) throw Error("AI returned no text.");
	return content;
}

export async function rewrite(text: string, instruction: string, signal: AbortSignal): Promise<string> {
	const result = (await requestJSON(
		'Edit only the supplied CV text. Preserve facts. Never invent employers, qualifications, achievements, dates, numbers, metrics, or skills. Return raw JSON only: {"text":"revised plain text"}. No HTML or Markdown fences.',
		{ text, instruction },
		signal,
	)) as { text: string };
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
