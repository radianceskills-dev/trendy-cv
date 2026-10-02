import { useEffect, useRef, useState } from "react";
import { AISymbol } from "./AIActivity";
import { requestJSON } from "./ai";
import { OptimizationReview } from "./OptimizationReview";
import { PhotoEditor } from "./PhotoEditor";
import { loadPlanDraft, savePlanDraft } from "./plan-storage";
import { SectionEditor } from "./SectionEditor";
import { TemplateExport } from "./TemplateExport";
import { acceptPlan, newDraft, normalizeTarget, PLAN_PROMPT, targetKey, validatePlan } from "./target-plan.mjs";
import "./wizard.css";

type Inputs = { jobs: string; industries: string; titles: string; jd: string };
const emptyInputs: Inputs = { jobs: "", industries: "", titles: "", jd: "" };
const toTarget = (inputs: Inputs, required = true) =>
	normalizeTarget(
		{
			desiredJobs: inputs.jobs.split("\n"),
			industries: inputs.industries.split("\n"),
			jobTitles: inputs.titles.split("\n"),
			jobDescription: inputs.jd,
		},
		required,
	);

export function TargetPlanner() {
	const [openedVersion, setOpenedVersion] = useState(0);
	const [draft, setDraft] = useState(newDraft);
	const [inputs, setInputs] = useState<Inputs>(emptyInputs);
	const [ready, setReady] = useState(false);
	const [safe, setSafe] = useState(true);
	const [busy, setBusy] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [status, setStatus] = useState("");
	const [saveError, setSaveError] = useState("");
	const request = useRef<AbortController | null>(null);
	const revision = useRef(0);
	useEffect(() => {
		let active = true;
		loadPlanDraft()
			.then((value) => {
				if (!active) return;
				setDraft(value);
				setInputs({
					jobs: value.target.desiredJobs.join("\n"),
					industries: value.target.industries.join("\n"),
					titles: value.target.jobTitles.join("\n"),
					jd: value.target.jobDescription,
				});
			})
			.catch((e) => {
				if (active) {
					setSafe(false);
					setError(`Draft could not be restored. Autosave paused: ${e.message}`);
				}
			})
			.finally(() => {
				if (active) setReady(true);
			});
		return () => {
			active = false;
			request.current?.abort();
			revision.current++;
		};
	}, []);
	useEffect(() => {
		if (!ready || !safe) return;
		let active = true;
		const timer = setTimeout(() => {
			savePlanDraft(draft)
				.then(() => {
					if (active) {
						setStatus("Draft saved in this browser");
						setSaveError("");
					}
				})
				.catch((e) => {
					if (active) setSaveError(`Local save failed: ${e.message}`);
				});
		}, 350);
		return () => {
			active = false;
			clearTimeout(timer);
		};
	}, [draft, ready, safe]);
	function cancel() {
		revision.current++;
		request.current?.abort();
		setBusy(false);
	}
	function edit(key: keyof Inputs, value: string) {
		if (draft.accepted) return;
		cancel();
		setError("");
		setStatus("");
		const next = { ...inputs, [key]: value };
		setInputs(next);
		setDraft((old) => ({ ...old, plan: null, planTargetKey: null }));
		try {
			setDraft((old) => ({ ...old, target: toTarget(next, false), plan: null, planTargetKey: null }));
		} catch (e) {
			setError(e instanceof Error ? e.message : "Invalid target");
		}
	}
	async function generate() {
		cancel();
		setError("");
		let target: ReturnType<typeof normalizeTarget>;
		try {
			target = toTarget(inputs);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Invalid target");
			return;
		}
		const controller = new AbortController();
		request.current = controller;
		const id = revision.current;
		setBusy(true);
		try {
			const plan = validatePlan(await requestJSON(PLAN_PROMPT, { target }, controller.signal), target);
			if (controller.signal.aborted || revision.current !== id) return;
			setDraft((old) => ({ ...old, target, plan, planTargetKey: targetKey(target) }));
		} catch (e) {
			if (!controller.signal.aborted && revision.current === id)
				setError(e instanceof Error ? e.message : "Planning failed");
		} finally {
			if (revision.current === id) setBusy(false);
		}
	}
	async function accept() {
		setSaving(true);
		setError("");
		try {
			const next = acceptPlan(draft);
			await savePlanDraft(next);
			setDraft(next);
			setSaveError("");
			setStatus("Plan accepted and saved in this browser");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Could not save plan");
		} finally {
			setSaving(false);
		}
	}
	return (
		<>
			<header>
				<a href="/">← Trendy Tools</a>
				<strong>Trendy CV</strong>
				<span>YOUR TARGET · YOUR CV PLAN</span>
			</header>
			<main className="wizard">
				<p role="status">{ready ? status : "Restoring your draft…"}</p>
				{error && (
					<p role="alert" className="wizard-error">
						{error}
					</p>
				)}
				{saveError && (
					<p role="alert">
						{saveError}{" "}
						<button
							type="button"
							onClick={() =>
								savePlanDraft(draft)
									.then(() => {
										setSaveError("");
										setStatus("Draft saved in this browser");
									})
									.catch((e) => setSaveError(e.message))
							}
						>
							Retry save
						</button>
					</p>
				)}
				{draft.legacyBackup && (
					<p>
						Your previous CV draft is preserved. After accepting the plan, you can restore matching entries or extract
						its text.
					</p>
				)}
				<section>
					<h1>{draft.accepted ? "Your target is confirmed" : "What are you applying for?"}</h1>
					<p>
						Enter one item per line. Desired jobs and industries are required; specific titles and a job description are
						optional.
					</p>
					<fieldset disabled={!ready || !safe || draft.accepted || saving}>
						{(
							[
								["jobs", "Desired jobs / roles (required)", 2000],
								["industries", "Industries (required)", 2000],
								["titles", "Specific job titles (optional)", 2000],
								["jd", "Job description (optional)", 20000],
							] as const
						).map(([key, label, max]) => (
							<label key={key} htmlFor={`target-${key}`}>
								{label}
								<textarea
									id={`target-${key}`}
									rows={key === "jd" ? 6 : 3}
									maxLength={max}
									required={key === "jobs" || key === "industries"}
									value={inputs[key]}
									onChange={(e) => edit(key, e.target.value)}
								/>
							</label>
						))}
					</fieldset>
					{!draft.accepted && (
						<>
							<p className="muted">
								Generating a plan sends these target fields to your configured AI provider. Keywords are suggestions,
								not claims about your skills.{" "}
								<a href="/" target="_blank" rel="noopener">
									AI setup
								</a>
							</p>
							<button type="button" disabled={!ready || !safe || busy || saving} onClick={generate}>
								<AISymbol />
								{draft.plan ? "Regenerate plan" : "Generate CV plan"}
							</button>
							{busy && (
								<button type="button" onClick={cancel}>
									Cancel planning
								</button>
							)}
							{busy && <p role="status">Planning keywords and sections…</p>}
						</>
					)}
				</section>
				{draft.plan && (
					<section style={{ marginTop: 24 }}>
						<h2>{draft.accepted ? "Your fixed section plan" : "Review your CV plan"}</h2>
						<h3>Suggested keywords</h3>
						<ul>
							{draft.plan.keywords.map((keyword) => (
								<li key={keyword.id}>
									<strong>{keyword.phrase}</strong> · {keyword.priority} priority · {keyword.category} ·{" "}
									{keyword.source === "jobDescription" ? "From your JD" : "Inferred from your target"}
									{keyword.evidence && <blockquote>{keyword.evidence}</blockquote>}
								</li>
							))}
						</ul>
						<h3>Planned sections</h3>
						<ol>
							{draft.plan.sections.map((section) => (
								<li key={section.id}>
									<strong>{section.title}</strong>
									<p>{section.rationale}</p>
								</li>
							))}
						</ol>
						<p>
							You will be able to add entries within these sections. Empty sections will be omitted from the finished
							CV.
						</p>
						{!draft.accepted ? (
							<button type="button" disabled={busy || saving || !safe} onClick={accept}>
								{saving ? "Saving plan…" : "Accept and save section plan"}
							</button>
						) : (
							<p role="status">Plan accepted. Fill and review your planned sections below.</p>
						)}
					</section>
				)}
				{draft.accepted && safe && (
					<SectionEditor
						key={openedVersion}
						draft={draft}
						onChange={setDraft}
						onConfirm={async (next) => {
							await savePlanDraft(next);
							setDraft(next);
							setStatus("Confirmed facts saved in this browser");
						}}
					/>
				)}
			</main>
			{draft.accepted && safe && (
				<div className="wizard">
					<OptimizationReview draft={draft} onChange={setDraft} />
					<PhotoEditor
						photo={draft.photo}
						onChange={async (photo) => {
							await savePlanDraft({ ...draft, photo });
							setDraft((current) => ({ ...current, photo }));
						}}
					/>
					<TemplateExport
						draft={draft}
						onOpen={async (next) => {
							await savePlanDraft(next);
							setDraft(next);
							setOpenedVersion((version) => version + 1);
							setInputs({
								jobs: next.target.desiredJobs.join("\n"),
								industries: next.target.industries.join("\n"),
								titles: next.target.jobTitles.join("\n"),
								jd: next.target.jobDescription,
							});
						}}
					/>
				</div>
			)}
		</>
	);
}
