import type { emptyCV } from "./wizard-model.mjs";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { ENTRY_FIELDS, emptyEntry, TEMPLATES, toResumeData } from "./resume-adapter.mjs";
import { CV_FIELDS, THEMES } from "./wizard-model.mjs";

const PdfPages = lazy(() => import("./PdfPages"));
type Entry = Record<string, string>;
export type Entries = Record<string, { source: string; items: Entry[] }>;
type Props = {
	cv: ReturnType<typeof emptyCV>;
	onChange: (key: string, value: string) => void;
	skills: string[];
	onSkills: (value: string[]) => void;
	entries: Entries;
	onEntries: (value: Entries) => void;
	template: string;
	onTemplate: (value: string) => void;
	theme: string;
	onTheme: (value: string) => void;
	paper: string;
	onPaper: (value: string) => void;
};
export default function TemplateBuilder(props: Props) {
	const { cv, entries, onEntries, template, theme, paper, skills } = props;
	const data = useMemo(
		() => toResumeData(defaultResumeData, cv, { template, theme, paper, skills }, entries),
		[cv, entries, template, theme, paper, skills],
	);
	const [result, setResult] = useState<{ data: typeof data; blob: Blob; url: string } | null>(null);
	const [error, setError] = useState("");
	const [retry, setRetry] = useState(0);
	useEffect(() => {
		// Explicit retry reruns generation even when the content has not changed.
		void retry;
		let cancelled = false;
		let url: string | undefined;
		setError("");
		const timer = setTimeout(async () => {
			try {
				const { createResumePdfBlob } = await import("@reactive-resume/pdf/browser");
				if (cancelled) return;
				const blob = await createResumePdfBlob({ data });
				if (cancelled) return;
				url = URL.createObjectURL(blob);
				setResult({ data, blob, url });
			} catch (e) {
				if (!cancelled) setError(e instanceof Error ? e.message : "PDF generation failed");
			}
		}, 600);
		return () => {
			cancelled = true;
			clearTimeout(timer);
			if (url) URL.revokeObjectURL(url);
		};
	}, [data, retry]);
	const current = result?.data === data ? result : null;
	function update(kind: string, items: Entry[]) {
		onEntries({ ...entries, [kind]: { source: cv[kind], items } });
	}
	return (
		<>
			<h1>Your CV is ready to edit</h1>
			<p>
				Edit your details and compare real templates. Preview and download use the same PDF, generated in your browser.
			</p>
			<div className="template-controls">
				<label>
					Template
					<select aria-label="Template" value={template} onChange={(e) => props.onTemplate(e.target.value)}>
						{Object.entries(TEMPLATES).map(([key, label]) => (
							<option key={key} value={key}>
								{label}
							</option>
						))}
					</select>
				</label>
				<label>
					Theme
					<select aria-label="Theme" value={theme} onChange={(e) => props.onTheme(e.target.value)}>
						{Object.keys(THEMES).map((key) => (
							<option key={key}>{key}</option>
						))}
					</select>
				</label>
				<label>
					Paper
					<select aria-label="Paper" value={paper} onChange={(e) => props.onPaper(e.target.value)}>
						<option value="a4">A4</option>
						<option value="letter">US Letter</option>
					</select>
				</label>
			</div>
			{error ? (
				<p role="alert">
					{error}{" "}
					<button type="button" onClick={() => setRetry((n) => n + 1)}>
						Retry PDF
					</button>
				</p>
			) : (
				!current && <p role="status">Updating PDF…</p>
			)}
			<button
				type="button"
				disabled={!current}
				onClick={() => {
					if (!current) return;
					const a = document.createElement("a");
					a.href = current.url;
					a.download = "trendy-cv.pdf";
					a.click();
				}}
			>
				Export PDF
			</button>
			<div className="template-workspace">
				<div className="template-editor">
					<details>
						<summary>Personal details and content</summary>
						{CV_FIELDS.map((key) => (
							<label key={key}>
								{key}
								<textarea
									aria-label={`Edit ${key}`}
									value={cv[key]}
									maxLength={12000}
									rows={key === "summary" ? 5 : 2}
									onChange={(e) => props.onChange(key, e.target.value)}
								/>
							</label>
						))}
						<label>
							Displayed skills
							<textarea
								aria-label="Displayed skills"
								value={skills.join("\n")}
								onChange={(e) => props.onSkills(e.target.value.split("\n"))}
							/>
						</label>
					</details>
					{Object.entries(ENTRY_FIELDS).map(([kind, fields]) => {
						const group = entries[kind];
						const active = group?.source === cv[kind];
						return (
							<details key={kind}>
								<summary>Structure {kind}</summary>
								<p>
									Separate entries let templates align names, roles and dates. Original curated text stays below for
									reference.
								</p>
								<pre className="source-text">{cv[kind] || "No original text"}</pre>
								{group && !active && (
									<p role="status">
										Source text changed. Preview uses the updated text. Your earlier entries are retained below; check
										them before using them again.
									</p>
								)}
								{group?.items.map((entry, index) => (
									<fieldset key={index}>
										<legend>
											{kind} {index + 1}
										</legend>
										{Object.entries(fields).map(([key, label]) => (
											<label key={key}>
												{label}
												<textarea
													aria-label={`${kind} ${index + 1} ${label}`}
													value={entry[key]}
													maxLength={12000}
													rows={key === "description" ? 4 : 1}
													onChange={(e) =>
														onEntries({
															...entries,
															[kind]: {
																...group,
																items: group.items.map((item, i) =>
																	i === index ? { ...item, [key]: e.target.value } : item,
																),
															},
														})
													}
												/>
											</label>
										))}
										<button
											type="button"
											onClick={() =>
												onEntries({
													...entries,
													[kind]: { ...group, items: group.items.filter((_, i) => i !== index) },
												})
											}
										>
											Remove {kind} {index + 1}
										</button>
									</fieldset>
								))}
								<button
									type="button"
									disabled={(group?.items.length || 0) >= 100}
									onClick={() => {
										const source = group?.source ?? cv[kind];
										const items =
											group?.items ?? (cv[kind].trim() ? [{ ...emptyEntry(kind), description: cv[kind] }] : []);
										onEntries({ ...entries, [kind]: { source, items: [...items, emptyEntry(kind)] } });
									}}
								>
									Add {kind} entry
								</button>
								{group && !active && (
									<button type="button" onClick={() => update(kind, group.items)}>
										Use checked {kind} entries
									</button>
								)}
								{group && (
									<button
										type="button"
										onClick={() => {
											const next = { ...entries };
											delete next[kind];
											onEntries(next);
										}}
									>
										Use original {kind} text
									</button>
								)}
							</details>
						);
					})}
				</div>
				<section aria-label="PDF preview">
					{current && (
						<Suspense fallback={<p>Loading PDF viewer…</p>}>
							<PdfPages blob={current.blob} />
						</Suspense>
					)}
				</section>
			</div>
		</>
	);
}
