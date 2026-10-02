export async function readAIStream(response, onText) {
	if (!response.body) throw Error("AI returned no response stream.");
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let output = "";
	let truncated = false;
	function event(frame) {
		const data = frame
			.split("\n")
			.filter((line) => line.startsWith("data:"))
			.map((line) => line.slice(5).trimStart())
			.join("\n");
		if (!data || data === "[DONE]") return;
		const parsed = JSON.parse(data);
		if (parsed.error) throw Error("AI provider returned a streaming error.");
		const choice = parsed.choices?.[0];
		if (choice?.finish_reason === "length") truncated = true;
		const text = choice?.delta?.content;
		if (typeof text === "string") {
			output += text;
			if (output.length > 100000) throw Error("AI response is too large.");
			onText(text);
		}
	}
	try {
		while (true) {
			const { value, done } = await reader.read();
			buffer += decoder.decode(value, { stream: !done });
			buffer = buffer.replace(/\r\n/g, "\n");
			let end = buffer.indexOf("\n\n");
			while (end >= 0) {
				event(buffer.slice(0, end));
				buffer = buffer.slice(end + 2);
				end = buffer.indexOf("\n\n");
			}
			if (buffer.length > 200000) throw Error("AI stream frame is too large.");
			if (done) {
				if (buffer.trim()) event(buffer);
				break;
			}
		}
	} finally {
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
	if (truncated) throw Error("AI output was cut off. Shorten the input or choose another model.");
	if (!output.trim()) throw Error("AI returned no text.");
	return output;
}
