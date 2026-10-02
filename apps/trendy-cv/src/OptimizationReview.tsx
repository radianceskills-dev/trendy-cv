import type { newDraft } from "./target-plan.mjs";
import { useEffect, useRef, useState } from "react";
import { AISymbol } from "./AIActivity";
import { requestJSON } from "./ai";
import {
	applyOptimizationChange,
	OPTIMIZATION_PROMPT,
	optimizationInput,
	optimizationKey,
	validateOptimizationReview,
} from "./optimization.mjs";

type Draft = ReturnType<typeof newDraft>;
export function OptimizationReview({ draft, onChange }: { draft: Draft; onChange: (draft: Draft) => void }) {
	const [review, setReview] = useState<ReturnType<typeof validateOptimizationReview> | null>(null);
	const [decisions, setDecisions] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [finished, setFinished] = useState(false);
	const controller = useRef<AbortController | null>(null);
	const generation = useRef(0);
	const latest = useRef(draft);
	latest.current = draft;
	const key = optimizationKey(draft);
	useEffect(() => {
		// Content revisions and factual confirmation invalidate in-flight work.
		void key;
		void draft.factsConfirmed;
		controller.current?.abort();
		generation.current++;
		setBusy(false);
		setFinished(false);
		return () => {
			controller.current?.abort();
			generation.current++;
		};
	}, [key, draft.factsConfirmed]);
	const stale = !!review && review.before !== key;
	function cancel() {
		controller.current?.abort();
		generation.current++;
		setBusy(false);
	}
	async function optimize() {
		cancel();
		setError("");
		setReview(null);
		setDecisions({});
		setFinished(false);
		const snapshot = draft;
		const id = generation.current;
		const c = new AbortController();
		controller.current = c;
		try {
			const input = optimizationInput(snapshot);
			setBusy(true);
			const output = await requestJSON(OPTIMIZATION_PROMPT, input, c.signal);
			if (
				c.signal.aborted ||
				generation.current !== id ||
				!latest.current.factsConfirmed ||
				optimizationKey(latest.current) !== optimizationKey(snapshot)
			)
				return;
			setReview(validateOptimizationReview(output, snapshot));
		} catch (e) {
			if (!c.signal.aborted) setError(e instanceof Error ? e.message : "Optimization failed");
		} finally {
			if (generation.current === id) setBusy(false);
		}
	}
	return (
		<section style={{ marginTop: 24 }}>
			<h2>Optimize your CV wording</h2>
			<p>
				AI uses your job target, keywords, confirmed wording and skill lists. Identity fields, raw pasted CV and links
				are excluded. Text you wrote inside descriptions may still contain personal details.
			</p>
			<p>Check every proposal for accuracy. Keyword gaps are questions, not new claims added to your CV.</p>
			{!draft.factsConfirmed && <p>Confirm your facts above to request optimization.</p>}
			<button type="button" disabled={!draft.factsConfirmed || busy} onClick={optimize}>
				<AISymbol />
				{review ? "Request a fresh optimization review" : "Optimize with AI"}
			</button>
			{busy && (
				<>
					<p role="status">Reviewing wording against your keyword plan…</p>
					<button type="button" onClick={cancel}>
						Cancel optimization
					</button>
				</>
			)}
			{error && <p role="alert">{error} Your content is preserved; retry or keep your current wording.</p>}
			{stale && (
				<p role="alert">
					Content changed after this review. These suggestions cannot be applied. Confirm your facts and request a fresh
					review.
				</p>
			)}
			{review && (
				<>
					{!review.changes.length && <p>No wording changes proposed.</p>}
					{review.changes.map((change) => (
						<article key={change.id} className="suggestion">
							<h3>
								{draft.sections.find((s) => s.id === change.sectionId)?.title} · {change.field}
							</h3>
							<p>{change.reason}</p>
							<p>
								Related keywords:{" "}
								{change.keywordIds.map((id) => draft.plan.keywords.find((k) => k.id === id)?.phrase).join(", ") ||
									"General readability"}
							</p>
							<strong>Current</strong>
							<pre className="source-text">
								{Array.isArray(change.before) ? change.before.join("\n") : change.before}
							</pre>
							<strong>Proposed</strong>
							<pre className="source-text">
								{Array.isArray(change.proposed) ? change.proposed.join("\n") : change.proposed}
							</pre>
							{decisions[change.id] ? (
								<p>{decisions[change.id]}</p>
							) : (
								<>
									<button
										type="button"
										disabled={stale || !draft.factsConfirmed}
										onClick={() => {
											try {
												const next = applyOptimizationChange(draft, change, review.before);
												setReview({ ...review, before: optimizationKey(next) });
												setDecisions((old) => ({ ...old, [change.id]: "Accepted" }));
												onChange(next);
											} catch (e) {
												setError(e instanceof Error ? e.message : "Cannot apply suggestion");
											}
										}}
									>
										Accept suggestion
									</button>
									<button type="button" onClick={() => setDecisions((old) => ({ ...old, [change.id]: "Dismissed" }))}>
										Keep current wording
									</button>
								</>
							)}
						</article>
					))}
					{!!review.gaps.length && (
						<div>
							<h3>Keywords needing your input</h3>
							<ul>
								{review.gaps.map((gap, i) => (
									<li key={`${gap.keywordId}-${i}`}>
										<strong>{draft.plan.keywords.find((k) => k.id === gap.keywordId)?.phrase}</strong>: {gap.question}
									</li>
								))}
							</ul>
							<p>
								If relevant and true, add details in the section editor and confirm your facts again. Nothing here is
								inserted automatically.
							</p>
						</div>
					)}
				</>
			)}
			<button
				type="button"
				disabled={!draft.factsConfirmed || busy}
				onClick={() => {
					setDecisions(Object.fromEntries((review?.changes || []).map((c) => [c.id, decisions[c.id] || "Dismissed"])));
					setFinished(true);
				}}
			>
				Finish review / keep current wording
			</button>
			{finished && (
				<p role="status">
					Wording review finished. Final manual edits are available in the section editor. Photo and template selection
					are the next implementation phase.
				</p>
			)}
		</section>
	);
}
