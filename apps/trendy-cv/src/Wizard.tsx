import React, { useEffect, useRef, useState } from "react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { requestJSON, requestReview } from "./ai";
import { applyReviewChange, REVIEW_YAML_PROMPT, validateReview } from "./review.mjs";
import { contentPages, hasContent } from "./template-layout.mjs";
import {
	approvedSkills,
	CV_FIELDS,
	CV_PROMPT,
	emptyCV,
	escapeHTML,
	FORMATS,
	OPTIMIZE_PROMPT,
	TARGET_PROMPT,
	THEMES,
	validateCV,
	validateOptimization,
	validateTarget,
} from "./wizard-model.mjs";
import "./wizard.css";

type CV = ReturnType<typeof emptyCV>;
type Target = ReturnType<typeof validateTarget>;
type Suggestion = ReturnType<typeof validateReview>[number];
type Optimization = ReturnType<typeof validateOptimization>;
const steps = ["Your target", "Your CV", "Review content", "Choose format", "Edit & export"];
const labels = {
	name: "Full name",
	email: "Email",
	phone: "Phone",
	location: "Location",
	headline: "Professional title",
	summary: "Professional summary",
	experience: "Experience — employer, role, dates, achievements",
	education: "Education — institution, qualification, dates",
	additional: "Additional sections — certifications, publications, awards, volunteering",
};
async function saveDraft(value?: unknown) {
	const db = await new Promise<IDBDatabase>((resolve, reject) => {
		const r = indexedDB.open("trendy-cv-wizard", 1);
		r.onupgradeneeded = () => r.result.createObjectStore("drafts");
		r.onsuccess = () => resolve(r.result);
		r.onerror = () => reject(r.error);
	});
	try {
		return await new Promise<unknown>((resolve, reject) => {
			const tx = db.transaction("drafts", value === undefined ? "readonly" : "readwrite");
			const store = tx.objectStore("drafts");
			const r = value === undefined ? store.get("current") : store.put(value, "current");
			tx.oncomplete = () => resolve(r.result);
			tx.onerror = () => reject(tx.error);
		});
	} finally {
		db.close();
	}
}

function Field({
	name,
	value,
	onChange,
	long = false,
}: {
	name: string;
	value: string;
	onChange: (v: string) => void;
	long?: boolean;
}) {
	const id = React.useId();
	return (
		<label htmlFor={id}>
			{name}
			{long ? (
				<textarea id={id} value={value} maxLength={12000} rows={5} onChange={(e) => onChange(e.target.value)} />
			) : (
				<input id={id} value={value} maxLength={500} onChange={(e) => onChange(e.target.value)} />
			)}
		</label>
	);
}
function Editable({
	label,
	value,
	onChange,
	tag = "p",
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	tag?: "p" | "h1" | "h2";
}) {
	return React.createElement(
		tag,
		{
			contentEditable: true,
			suppressContentEditableWarning: true,
			role: "textbox",
			"aria-label": label,
			"aria-multiline": true,
			onBlur: (e: React.FocusEvent<HTMLElement>) => onChange((e.currentTarget.innerText || "").slice(0, 12000)),
			onPaste: (e: React.ClipboardEvent<HTMLElement>) => {
				e.preventDefault();
				document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
			},
		},
		value,
	);
}
export function Wizard() {
	const [step, setStep] = useState(0);
	const [roles, setRoles] = useState("");
	const [titles, setTitles] = useState("");
	const [industries, setIndustries] = useState("");
	const [jd, setJD] = useState("");
	const [target, setTarget] = useState<Target | null>(null);
	const [targetStatus, setTargetStatus] = useState("");
	const [cv, setCV] = useState<CV>(emptyCV);
	const [mode, setMode] = useState("form");
	const [raw, setRaw] = useState("");
	const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
	const [decisions, setDecisions] = useState<Record<string, string>>({});
	const [format, setFormat] = useState("simple");
	const [theme, setTheme] = useState("Arctic");
	const [paper, setPaper] = useState("a4");
	const [optimization, setOptimization] = useState<Optimization | null>(null);
	const [shownSkills, setShownSkills] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);
	const [reviewProgress, setReviewProgress] = useState("");
	const [error, setError] = useState("");
	const [ready, setReady] = useState(false);
	const [saved, setSaved] = useState("");
	const [storageSafe, setStorageSafe] = useState(true);
	const targetController = useRef<AbortController | null>(null);
	const workController = useRef<AbortController | null>(null);
	const targetPromise = useRef<Promise<Target> | null>(null);
	const runId = useRef(0);
	const targetId = useRef(0);
	useEffect(() => {
		saveDraft()
			.then((value) => {
				if (!value) return;
				const d = value as {
					cv: CV;
					roles: string;
					titles: string;
					industries: string;
					jd: string;
					raw: string;
					mode: string;
					shownSkills?: string[];
					format?: string;
					theme?: string;
				};
				setCV(validateCV(d.cv));
				setRoles(d.roles || "");
				setTitles(d.titles || "");
				setIndustries(d.industries || "");
				setJD(d.jd || "");
				setRaw(d.raw || "");
				setMode(d.mode || "form");
				if (Array.isArray(d.shownSkills)) setShownSkills(d.shownSkills.filter((s) => typeof s === "string"));
				if (d.format && Object.hasOwn(FORMATS, d.format)) setFormat(d.format);
				if (d.theme && Object.hasOwn(THEMES, d.theme)) setTheme(d.theme);
			})
			.catch(() => {
				setStorageSafe(false);
				setError("Draft could not be restored. Autosave is paused to preserve the stored draft.");
			})
			.finally(() => setReady(true));
		return () => {
			targetController.current?.abort();
			workController.current?.abort();
		};
	}, []);
	useEffect(() => {
		if (!ready || !storageSafe) return;
		const timer = setTimeout(() => {
			saveDraft({ cv, roles, titles, industries, jd, raw, mode, shownSkills, format, theme })
				.then(() => setSaved("Draft saved in this browser"))
				.catch(() => setSaved("Autosave failed. Keep a copy of your text."));
		}, 500);
		return () => clearTimeout(timer);
	}, [ready, storageSafe, cv, roles, titles, industries, jd, raw, mode, shownSkills, format, theme]);
	const change = (key: keyof CV, value: string | string[]) => setCV((old) => ({ ...old, [key]: value }));
	function cancel() {
		runId.current++;
		workController.current?.abort();
		setBusy(false);
	}
	function back() {
		cancel();
		setError("");
		setStep((s) => Math.max(0, s - 1));
	}
	function analyzeTarget() {
		targetController.current?.abort();
		const c = new AbortController();
		targetController.current = c;
		const id = ++targetId.current;
		setTarget(null);
		setTargetStatus("AI is structuring your job target in the background…");
		const promise = requestJSON(TARGET_PROMPT, { roles, titles, industries, jobDescription: jd }, c.signal)
			.then(validateTarget)
			.then((t) => {
				if (c.signal.aborted || id !== targetId.current) throw Error("Target analysis cancelled");
				setTarget(t);
				setTargetStatus("Target analysis ready");
				return t;
			});
		targetPromise.current = promise;
		promise.catch((e) => {
			if (!c.signal.aborted && id === targetId.current)
				setTargetStatus(`Target analysis failed: ${e.message}. Retry before continuing.`);
		});
	}
	function nextTarget() {
		if (![roles, titles, industries, jd].some((v) => v.trim())) {
			setError("Enter a role, title, industry, or job description.");
			return;
		}
		setError("");
		analyzeTarget();
		setStep(1);
	}
	async function parseCV() {
		if (!raw.trim()) {
			setError("Paste your CV as plain text first.");
			return;
		}
		cancel();
		const id = runId.current;
		const c = new AbortController();
		workController.current = c;
		setBusy(true);
		setReviewProgress("Extracting your CV into fields…");
		setError("");
		try {
			const structured = validateCV(await requestJSON(CV_PROMPT, { cvText: raw }, c.signal));
			if (c.signal.aborted || id !== runId.current) return;
			setCV(structured);
			setMode("form");
			setSuggestions([]);
			setDecisions({});
			setReviewProgress("Details extracted. Check the populated fields before requesting a professional review.");
		} catch (e) {
			if (!c.signal.aborted) setError(e instanceof Error ? e.message : "Could not structure CV");
		} finally {
			if (id === runId.current) setBusy(false);
		}
	}
	async function reviewCV() {
		cancel();
		const id = runId.current;
		const c = new AbortController();
		workController.current = c;
		setBusy(true);
		setError("");
		setReviewProgress("Professional review: preparing up to six prioritized suggestions…");
		try {
			const snapshot = validateCV(cv);
			const { name, email, phone, location, ...content } = snapshot;
			const changes = validateReview(
				await requestReview(
					REVIEW_YAML_PROMPT,
					{ target: target || { roles, titles, industries, jobDescription: jd }, cv: content },
					c.signal,
				),
				snapshot,
			);
			if (c.signal.aborted || id !== runId.current) return;
			setSuggestions(changes);
			setDecisions({});
			setStep(2);
		} catch (e) {
			if (!c.signal.aborted)
				setError(e instanceof Error ? e.message : "Review failed. Your populated CV is preserved.");
		} finally {
			if (id === runId.current) setBusy(false);
		}
	}
	function decide(s: Suggestion, accept: boolean) {
		if (accept) {
			try {
				const next = applyReviewChange(cv, s);
				setCV(next);
				// Accepted additions are known changes, not intervening user edits.
				if (s.action === "suggest_add")
					setSuggestions((list) =>
						list.map((other) =>
							other.field === "skills" && JSON.stringify(other.before) === JSON.stringify(s.before)
								? { ...other, before: [...next.skills] }
								: other,
						),
					);
			} catch (e) {
				setError(e instanceof Error ? e.message : "Cannot apply stale suggestion");
				return;
			}
		}
		setDecisions((d) => ({ ...d, [s.id]: accept ? "accepted" : "dismissed" }));
	}
	async function optimize() {
		cancel();
		const id = runId.current;
		const c = new AbortController();
		workController.current = c;
		setBusy(true);
		setError("");
		try {
			const v = validateOptimization(
				await requestJSON(OPTIMIZE_PROMPT, { target, skills: cv.skills, maxGroups: FORMATS[format].skills }, c.signal),
				cv,
				format,
			);
			if (c.signal.aborted || id !== runId.current) return;
			setOptimization(v);
			setShownSkills(approvedSkills(cv, v));
			setStep(4);
		} catch (e) {
			if (!c.signal.aborted) setError(e instanceof Error ? e.message : "Could not optimize format");
		} finally {
			if (id === runId.current) setBusy(false);
		}
	}
	async function exportPDF() {
		setBusy(true);
		setError("");
		try {
			const data = structuredClone(defaultResumeData);
			data.basics = {
				...data.basics,
				name: cv.name,
				email: cv.email,
				phone: cv.phone,
				location: cv.location,
				headline: cv.headline,
			};
			data.picture.hidden = true;
			const html = (v: string) => escapeHTML(v).replace(/\n/g, "<br>");
			data.summary.content = html(cv.summary);
			data.summary.title = "Profile";
			data.summary.hidden = !hasContent(cv.summary);
			data.metadata.template = format === "advanced" ? "azurill" : "onyx";
			data.metadata.page.format = paper as "a4" | "letter";
			data.metadata.typography.body.fontFamily = "Helvetica";
			data.metadata.typography.heading.fontFamily = "Helvetica";
			data.metadata.design.colors.primary = THEMES[theme];
			data.metadata.typography.body.fontSize = 10;
			data.metadata.typography.body.lineHeight = 1.5;
			data.metadata.typography.heading.fontSize = 13;
			data.metadata.page.gapY = 8;
			data.metadata.page.marginX = 16;
			data.metadata.page.marginY = 16;
			data.sections.experience.title = "Experience";
			data.sections.experience.items = hasContent(cv.experience)
				? [
						{
							id: "experience",
							hidden: false,
							company: "Experience",
							position: "",
							location: "",
							period: "",
							description: html(cv.experience),
							website: { url: "", label: "", inlineLink: false },
							roles: [],
						},
					]
				: [];
			data.sections.education.title = "Education";
			data.sections.education.items = hasContent(cv.education)
				? [
						{
							id: "education",
							hidden: false,
							school: "Education",
							degree: "",
							area: "",
							grade: "",
							location: "",
							period: "",
							description: html(cv.education),
							website: { url: "", label: "", inlineLink: false },
						},
					]
				: [];
			data.sections.skills.title = "Skills";
			data.sections.skills.items = shownSkills
				.filter((s) => s.trim())
				.map((s, i) => ({
					id: `skill-${i}`,
					hidden: false,
					name: s,
					proficiency: "",
					level: 0,
					keywords: [],
					icon: "",
					iconColor: "",
				}));
			data.sections.projects.title = "Additional information";
			data.sections.projects.items = hasContent(cv.additional)
				? [
						{
							id: "additional",
							hidden: false,
							name: "Additional information",
							period: "",
							description: html(cv.additional),
							website: { url: "", label: "", inlineLink: false },
						},
					]
				: [];
			data.metadata.layout.pages =
				format === "multipage"
					? [
							{ fullWidth: true, main: ["summary", "experience"], sidebar: [] },
							{ fullWidth: true, main: ["education", "skills", "projects"], sidebar: [] },
						]
					: [
							{
								fullWidth: format !== "advanced",
								main: ["summary", "experience", "education", "projects", ...(format === "advanced" ? [] : ["skills"])],
								sidebar: format === "advanced" ? ["skills"] : [],
							},
						];
			data.metadata.layout.pages = contentPages(cv, shownSkills, format);
			for (const section of Object.values(data.sections)) section.hidden = section.items.length === 0;
			const { createResumePdfBlob } = await import("@reactive-resume/pdf/browser");
			const blob = await createResumePdfBlob({ data });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "trendy-cv.pdf";
			a.click();
			setTimeout(() => URL.revokeObjectURL(url), 30000);
		} catch (e) {
			setError(e instanceof Error ? e.message : "PDF export failed");
		} finally {
			setBusy(false);
		}
	}
	const detailFields = () =>
		CV_FIELDS.map((key) => (
			<Field
				key={key}
				name={labels[key]}
				value={cv[key]}
				onChange={(v) => change(key, v)}
				long={["summary", "experience", "education", "additional"].includes(key)}
			/>
		));
	return (
		<>
			<header>
				<a href="/">← Trendy Tools</a>
				<strong>Trendy CV</strong>
				<span>FROM YOUR NEXT ROLE TO YOUR NEXT CV</span>
			</header>
			<ol className="wizard-steps">
				{steps.map((s, i) => (
					<li key={s} aria-current={step === i ? "step" : undefined} className={step === i ? "active" : ""}>
						{i + 1}. {s}
					</li>
				))}
			</ol>
			<main className="wizard">
				<p className="muted">{saved}</p>
				{error && (
					<p role="alert" className="wizard-error">
						{error}
					</p>
				)}
				{step === 0 && (
					<section>
						<h1>What are you applying for?</h1>
						<p>
							Tell us your interests, or paste a specific vacancy. AI will organize the target while you enter your CV.
						</p>
						<Field name="Roles you are interested in" value={roles} onChange={setRoles} />
						<Field name="Job titles" value={titles} onChange={setTitles} />
						<Field name="Industries" value={industries} onChange={setIndustries} />
						<Field name="Job description (optional, plain text)" value={jd} onChange={setJD} long />
						<p className="muted">
							Continuing sends these target fields to your configured AI provider. Related suggestions will be marked as
							inferred.{" "}
							<a href="/" target="_blank" rel="noopener">
								AI setup
							</a>
						</p>
						<button type="button" disabled={!ready} onClick={nextTarget}>
							Next: Your CV
						</button>
					</section>
				)}
				{step === 1 && (
					<section>
						<h1>Tell us about yourself</h1>
						<p role="status">{targetStatus}</p>
						<button type="button" disabled={busy} onClick={analyzeTarget}>
							Retry target analysis
						</button>
						{target && (
							<details>
								<summary>Review job target and inferred additions</summary>
								{Object.entries(target).map(([k, v]) => (
									<p key={k}>
										<strong>{k}: </strong>
										{v.join("; ")}
									</p>
								))}
							</details>
						)}
						<label>
							How will you provide your CV?
							<select value={mode} disabled={busy} onChange={(e) => setMode(e.target.value)}>
								<option value="form">Fill in fields</option>
								<option value="text">Paste my entire CV (text only)</option>
							</select>
						</label>
						<fieldset disabled={busy}>
							{mode === "text" ? (
								<Field name="Paste CV text" value={raw} onChange={setRaw} long />
							) : (
								<>
									{detailFields()}
									<Field
										name="Skills (one per line)"
										value={cv.skills.join("\n")}
										onChange={(v) => change("skills", v.split("\n"))}
										long
									/>
								</>
							)}
						</fieldset>
						<p className="muted">
							For pasted CVs, this text—including any contact details it contains—is sent for extraction. With fields,
							only career content is sent for recommendations; contact fields remain local.
						</p>
						<p role="status">{reviewProgress}</p>
						{mode === "text" ? (
							<button type="button" disabled={busy || !raw.trim()} onClick={parseCV}>
								Fill my details
							</button>
						) : (
							<>
								<button type="button" disabled={busy} onClick={reviewCV}>
									Review with AI
								</button>
								<button
									type="button"
									disabled={busy}
									onClick={() => {
										setError("");
										setStep(3);
									}}
								>
									Skip review: Choose format
								</button>
							</>
						)}
					</section>
				)}
				{step === 2 && (
					<section>
						<h1>Confirm your CV content</h1>
						<p>
							Check extracted facts and fill any gaps. Suggestions change nothing until you accept. Approve skills only
							if you actually have them.
						</p>
						{suggestions.map((s) => (
							<article className="suggestion" key={s.id}>
								<h2>{s.field}</h2>
								<p>{s.reason}</p>
								<p>{s.question}</p>
								<pre>Current: {Array.isArray(cv[s.field]) ? cv[s.field].join(", ") : cv[s.field]}</pre>
								<Field
									name={`Suggested ${s.field}`}
									value={Array.isArray(s.proposed) ? s.proposed.join("\n") : s.proposed}
									long
									onChange={(v) =>
										setSuggestions((list) => list.map((x) => (x.id === s.id ? { ...x, proposed: v } : x)))
									}
								/>
								{decisions[s.id] ? (
									<p>{decisions[s.id]}</p>
								) : (
									<>
										<button type="button" onClick={() => decide(s, true)}>
											Accept {s.field}
										</button>
										<button type="button" onClick={() => decide(s, false)}>
											Keep current {s.field}
										</button>
									</>
								)}
							</article>
						))}
						<details open={!suggestions.length}>
							<summary>Edit and verify all CV details</summary>
							{detailFields()}
							<Field
								name="Skills (one per line)"
								value={cv.skills.join("\n")}
								onChange={(v) => change("skills", v.split("\n"))}
								long
							/>
						</details>
						<button
							type="button"
							disabled={suggestions.some((s) => !decisions[s.id])}
							onClick={() => {
								setError("");
								setStep(3);
							}}
						>
							Content confirmed: Choose format
						</button>
					</section>
				)}
				{step === 3 && (
					<section>
						<h1>Choose your format</h1>
						<div className="format-options">
							{Object.entries(FORMATS).map(([k, f]) => (
								<button
									type="button"
									key={k}
									className={format === k ? "selected" : ""}
									aria-pressed={format === k}
									onClick={() => setFormat(k)}
								>
									<strong>{f.label}</strong>
									<p>{f.description}</p>
								</button>
							))}
						</div>
						<label>
							Theme
							<select value={theme} onChange={(e) => setTheme(e.target.value)}>
								{Object.keys(THEMES).map((t) => (
									<option key={t}>{t}</option>
								))}
							</select>
						</label>
						<label>
							Paper
							<select value={paper} onChange={(e) => setPaper(e.target.value)}>
								<option value="a4">A4</option>
								<option value="letter">US Letter</option>
							</select>
						</label>
						<p>
							AI will group and prioritize confirmed skills to fit this format automatically. Your complete skills list
							remains in the draft. Other CV facts are preserved.
						</p>
						<button type="button" disabled={busy} onClick={optimize}>
							{busy ? "Optimizing layout…" : "Create my CV"}
						</button>
					</section>
				)}
				{step === 4 && (
					<section>
						<h1>Your CV is ready to edit</h1>
						<p>
							Click any text in the HTML preview to edit. Click outside the field to save the change before exporting.
						</p>
						<p>{optimization?.note}</p>
						{!!optimization?.omitted.length && (
							<details>
								<summary>Skills retained in your draft but omitted from this format</summary>
								<p>{optimization.omitted.join(", ")}</p>
							</details>
						)}
						<button type="button" disabled={busy} onClick={exportPDF}>
							{busy ? "Exporting…" : "Export PDF"}
						</button>
						<p className="muted">Empty sections are hidden. Use Back to add information in the form.</p>
						<div
							className={`cv-preview ${format} ${shownSkills.some(hasContent) ? "has-skills" : ""}`}
							style={{ "--cv-accent": THEMES[theme] } as React.CSSProperties}
						>
							<Editable tag="h1" label="Edit name" value={cv.name} onChange={(v) => change("name", v)} />
							{hasContent(cv.headline) && (
								<Editable
									tag="h2"
									label="Edit professional title"
									value={cv.headline}
									onChange={(v) => change("headline", v)}
								/>
							)}
							<div className="cv-contact">
								{["email", "phone", "location"]
									.filter((k) => hasContent(cv[k]))
									.map((k) => (
										<Editable key={k} label={`Edit ${k}`} value={cv[k]} onChange={(v) => change(k as keyof CV, v)} />
									))}
							</div>
							<div className="cv-columns">
								<div>
									{["summary", "experience", "education", "additional"]
										.filter((k) => hasContent(cv[k]))
										.map((k) => (
											<section key={k} className={format === "multipage" && k === "education" ? "page-start" : ""}>
												<h2>{k === "additional" ? "Additional information" : k[0].toUpperCase() + k.slice(1)}</h2>
												<Editable label={`Edit ${k}`} value={cv[k]} onChange={(v) => change(k as keyof CV, v)} />
											</section>
										))}
								</div>
								{shownSkills.some(hasContent) && (
									<section className="cv-skills">
										<h2>Skills</h2>
										{shownSkills.map(
											(s, i) =>
												hasContent(s) && (
													<Editable
														key={i}
														label={`Edit skill group ${i + 1}`}
														value={s}
														onChange={(v) => setShownSkills((old) => old.map((x, j) => (j === i ? v : x)))}
													/>
												),
										)}
									</section>
								)}
							</div>
						</div>
						<p className="muted">
							PDF uses the same edited content with a print template. Screen and PDF pagination may differ; long
							sections should be checked after export.
						</p>
					</section>
				)}
				{step > 0 && (
					<button type="button" className="back" onClick={back}>
						Back
					</button>
				)}
				{busy && (
					<button type="button" onClick={cancel}>
						Cancel AI task
					</button>
				)}
			</main>
		</>
	);
}
