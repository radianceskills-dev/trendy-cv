import { appendActivity, finishActivity, progressActivity, startActivity } from "./ai-activity";
import { parseAIJSON, withCancellation } from "./ai-json.mjs";
import { readAIStream } from "./ai-stream.mjs";
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
	return trackedRequest(system, input, signal, parseAIJSON);
}

export function requestReview(system: string, input: unknown, signal: AbortSignal): Promise<unknown> {
	return trackedRequest(system, input, signal, parseReviewYAML);
}

async function trackedRequest(system: string, input: unknown, signal: AbortSignal, parse: (text: string) => unknown) {
	const label =
		system.startsWith("Plan a CV") || system.startsWith("Structure job")
			? "Target planning"
			: system.startsWith("Extract")
				? "CV extraction"
				: system.startsWith("Improve CV") || system.startsWith("Optimize")
					? "CV optimization"
					: "CV review";
	const id = startActivity(label);
	try {
		const result = await withCancellation(
			async (s: AbortSignal) =>
				parse(
					await requestText(
						system,
						input,
						s,
						(text) => {
							if (!s.aborted) appendActivity(id, text);
						},
						(progress) => {
							if (!s.aborted) progressActivity(id, progress);
						},
					),
				),
			signal,
		);
		finishActivity(id, "complete");
		return result;
	} catch (e) {
		finishActivity(id, signal.aborted ? "cancelled" : "failed", e instanceof Error ? e.message : "AI request failed");
		throw e;
	}
}

async function requestText(
	system: string,
	input: unknown,
	signal: AbortSignal,
	onText: (text: string) => void,
	onProgress: (text: string) => void,
): Promise<string> {
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
			body: JSON.stringify({ model: s.model, messages, temperature: 0.1, stream: true }),
			signal,
		});
		if (!r.ok) throw Error(`AI request failed (${r.status})`);
		if (r.headers.get("content-type")?.includes("text/event-stream")) return readAIStream(r, onText, onProgress);
		payload = await r.json();
	}
	if (signal.aborted) throw Error("Cancelled");
	if (typeof payload !== "string" && payload?.choices?.[0]?.finish_reason === "length") {
		throw Error("AI output was cut off. Shorten the CV text or choose a model with a larger output limit, then retry.");
	}
	const content =
		typeof payload === "string" ? payload : (payload?.choices?.[0]?.message?.content ?? payload?.message?.content);
	if (typeof content !== "string" || !content.trim()) throw Error("AI returned no text.");
	onText(content);
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
