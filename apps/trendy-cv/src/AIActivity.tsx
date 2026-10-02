import { useState, useSyncExternalStore } from "react";
import { getActivity, subscribeActivity } from "./ai-activity";
import "./ai-activity.css";
export function AISymbol() {
	return <span aria-hidden="true">✦ </span>;
}
export function AIActivity() {
	const activity = useSyncExternalStore(subscribeActivity, getActivity);
	const [open, setOpen] = useState(false);
	const busy = activity.some((item) => item.status === "generating");
	return (
		<aside className="ai-activity">
			{open && (
				<section id="ai-output-panel" className="ai-output" aria-label="AI generated text">
					<div className="ai-output-heading">
						<strong>AI activity</strong>
						<button type="button" onClick={() => setOpen(false)} aria-label="Close AI output">
							Close
						</button>
					</div>
					<p>Raw AI output for this session. Suggestions still require review in the editor.</p>
					{!activity.length && <p>No AI generation yet.</p>}
					{[...activity].reverse().map((item) => (
						<article key={item.id}>
							<h3>{item.label}</h3>
							<p role="status">
								{item.status}
								{item.error ? `: ${item.error}` : ""}
							</p>
							<pre>
								{item.text || (item.status === "generating" ? "Waiting for provider output…" : "No text returned.")}
							</pre>
						</article>
					))}
				</section>
			)}
			<button
				className={`ai-float ${busy ? "generating" : ""}`}
				type="button"
				aria-expanded={open}
				aria-controls="ai-output-panel"
				aria-label={busy ? "AI generating — show output" : "Show AI output"}
				onClick={() => setOpen((value) => !value)}
			>
				<AISymbol />
				{busy ? "AI generating" : "AI output"}
			</button>
		</aside>
	);
}
