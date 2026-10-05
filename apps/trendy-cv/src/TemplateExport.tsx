import type { SavedCV } from "./cv-library";
import type { newDraft } from "./target-plan.mjs";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { library } from "./cv-library";
import { validateDraft } from "./target-plan.mjs";
import { pdfFileName, TEMPLATE_CATALOG, templateEligibility } from "./template-catalog.mjs";

const PdfPages = lazy(() => import("./PdfPages"));
type Draft = ReturnType<typeof newDraft>;
type Props = {
	draft: Draft;
	onOpen: (draft: Draft) => Promise<void>;
	initialTemplate?: string;
	initialPaper?: "a4" | "letter";
};
export function TemplateExport({ draft, onOpen, initialTemplate = "precision", initialPaper = "a4" }: Props) {
	const [template, setTemplate] = useState(initialTemplate);
	const [paper, setPaper] = useState<"a4" | "letter">(initialPaper);
	const [records, setRecords] = useState<SavedCV[]>([]);
	const [name, setName] = useState("");
	const [naming, setNaming] = useState(false);
	const [status, setStatus] = useState("");
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);
	const [result, setResult] = useState<{
		draft: Draft;
		template: string;
		paper: string;
		blob: Blob;
		url: string;
		pages: number;
	} | null>(null);
	const [fit, setFit] = useState<Record<string, string>>({});
	const active = useRef(true);
	useEffect(() => {
		active.current = true;
		library("list")
			.then(setRecords)
			.catch((e) => setError(e.message));
		return () => {
			active.current = false;
		};
	}, []);
	useEffect(() => {
		void draft;
		void paper;
		setFit({});
		setNaming(false);
	}, [draft, paper]);
	useEffect(() => {
		if (!draft.factsConfirmed || !templateEligibility(draft, template).eligible) return;
		let cancelled = false;
		let url: string | undefined;
		setError("");
		const timer = setTimeout(async () => {
			try {
				const { createCustomPDF } = await import("./custom-pdf");
				const blob = await createCustomPDF(draft, template, paper);
				if (cancelled) return;
				const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");
				GlobalWorkerOptions.workerSrc = new URL(
					"pdfjs-dist/legacy/build/pdf.worker.min.mjs",
					import.meta.url,
				).toString();
				const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
				let pages = 0;
				try {
					const pdf = await task.promise;
					pages = pdf.numPages;
					for (let n = 1; n <= pages; n++) {
						const page = await pdf.getPage(n);
						const text = await page.getTextContent();
						for (const item of text.items)
							if ("str" in item && item.str.trim()) {
								const [left, bottom, right, top] = page.view;
								if (
									item.transform[4] < left - 1 ||
									item.transform[4] + item.width > right + 1 ||
									item.transform[5] < bottom - 1 ||
									item.transform[5] > top + 1
								)
									throw Error("Content crosses page boundaries. Try another template or shorten unbroken text.");
							}
					}
				} finally {
					await task.destroy();
				}
				if (cancelled) return;
				url = URL.createObjectURL(blob);
				setResult({ draft, template, paper, blob, url, pages });
			} catch (e) {
				if (!cancelled) {
					const message = e instanceof Error ? e.message : "PDF generation failed";
					setError(message);
					setFit((old) => ({ ...old, [template]: message }));
				}
			}
		}, 400);
		return () => {
			cancelled = true;
			clearTimeout(timer);
			if (url) URL.revokeObjectURL(url);
		};
	}, [draft, template, paper]);
	const current =
		result?.draft === draft && result.template === template && result.paper === paper && draft.factsConfirmed
			? result
			: null;
	async function save() {
		if (!current || !name.trim()) return;
		setSaving(true);
		setError("");
		try {
			const records = await library("save", {
				id: crypto.randomUUID(),
				name: name.trim(),
				updatedAt: new Date().toISOString(),
				template,
				paper,
				draft: structuredClone(draft),
			});
			if (!active.current) return;
			setRecords(records);
			setStatus(`“${name.trim()}” saved in this browser. PDF download started.`);
			setNaming(false);
			const a = document.createElement("a");
			a.href = current.url;
			a.download = pdfFileName(name);
			a.click();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Local save failed");
		} finally {
			setSaving(false);
		}
	}
	return (
		<section style={{ marginTop: 24 }}>
			<h2>Choose your template & export</h2>
			<p>
				{draft.photo ? "Photo versions" : "No-photo versions"} are selected automatically. All nonempty sections retain
				their order. Edit content in the forms above; the preview is read-only.
			</p>
			{!draft.factsConfirmed && <p>Confirm your final facts above to generate a PDF.</p>}
			<fieldset disabled={saving}>
				<div className="format-options">
					{Object.entries(TEMPLATE_CATALOG).map(([id, config]) => {
						const eligibility = templateEligibility(draft, id);
						if (!eligibility.eligible) return null;
						return (
							<button
								key={id}
								type="button"
								aria-pressed={id === template}
								disabled={!draft.factsConfirmed || !!fit[id]}
								onClick={() => setTemplate(id)}
							>
								<strong>{config.name}</strong>
								<p>{config.description}</p>
								{fit[id] && <small>{fit[id]}</small>}
							</button>
						);
					})}
				</div>
				<label>
					PDF paper
					<select aria-label="PDF paper" value={paper} onChange={(e) => setPaper(e.target.value as "a4" | "letter")}>
						<option value="a4">A4</option>
						<option value="letter">US Letter</option>
					</select>
				</label>
				{error && <p role="alert">{error}</p>}
				<p role="status">{status}</p>
				{draft.factsConfirmed && !current && !error && <p role="status">Generating template preview…</p>}
				{current && (
					<>
						<p>
							{current.pages} verified PDF pages · {TEMPLATE_CATALOG[template].name}
						</p>
						<Suspense fallback={<p>Loading viewer…</p>}>
							<PdfPages blob={current.blob} />
						</Suspense>
						<button type="button" onClick={() => setNaming(true)}>
							Save CV & download PDF
						</button>
					</>
				)}
				{naming && current && (
					<div>
						<label>
							CV name
							<input aria-label="CV name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
						</label>
						<p>Each save creates a new local copy; existing CVs are preserved.</p>
						<button type="button" disabled={!name.trim()} onClick={save}>
							Save named CV
						</button>
						<button type="button" onClick={() => setNaming(false)}>
							Cancel save
						</button>
					</div>
				)}
				<details>
					<summary>Saved CVs in this browser ({records.length})</summary>
					{records.map((record) => (
						<div key={record.id}>
							<strong>{record.name}</strong> · {record.template}
							<button
								type="button"
								onClick={async () => {
									try {
										const restored = validateDraft(record.draft);
										await onOpen(restored);
										setTemplate(record.template);
										setPaper(record.paper);
										setName(record.name);
									} catch (e) {
										setError(e instanceof Error ? e.message : "Cannot open CV");
									}
								}}
							>
								Open {record.name}
							</button>
							<button
								type="button"
								onClick={async () => {
									if (!window.confirm(`Delete saved CV “${record.name}”?`)) return;
									try {
										setRecords(await library("delete", record.id));
									} catch (e) {
										setError(e instanceof Error ? e.message : "Cannot delete CV");
									}
								}}
							>
								Delete {record.name}
							</button>
						</div>
					))}
				</details>
			</fieldset>
		</section>
	);
}
