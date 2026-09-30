import { jsonrepair } from "jsonrepair";

export function parseAIJSON(content) {
	if (typeof content !== "string" || !content.trim()) throw Error("AI returned no text.");
	if (content.length > 100000) throw Error("AI response is too large.");
	try {
		return JSON.parse(content);
	} catch {
		try {
			return JSON.parse(jsonrepair(content));
		} catch {
			throw Error("AI returned JSON that could not be repaired. Your draft is unchanged. Please retry.");
		}
	}
}

export async function withDeadline(task, signal, milliseconds = 90000) {
	const controller = new AbortController();
	let timer;
	let abort;
	const stopped = new Promise((_, reject) => {
		abort = () => {
			controller.abort();
			reject(Error("Cancelled"));
		};
		if (signal.aborted) abort();
		else signal.addEventListener("abort", abort, { once: true });
		timer = setTimeout(() => {
			controller.abort();
			reject(Error("AI request timed out after 90 seconds. Your draft is unchanged. Retry or choose a faster model."));
		}, milliseconds);
	});
	try {
		if (signal.aborted) throw Error("Cancelled");
		return await Promise.race([stopped, task(controller.signal)]);
	} finally {
		clearTimeout(timer);
		signal.removeEventListener("abort", abort);
	}
}
