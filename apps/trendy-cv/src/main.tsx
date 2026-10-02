import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { parseJSONResume } from "@reactive-resume/import/json-resume";
import { parseResumeData } from "@reactive-resume/schema/resume/data";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { templateSchema } from "@reactive-resume/schema/templates";
import { rewrite } from "./ai";
import "./style.css";
import { TargetPlanner } from "./TargetPlanner";
import { Wizard } from "./Wizard";

const sections = [
	"experience",
	"education",
	"projects",
	"skills",
	"certifications",
	"languages",
	"publications",
	"awards",
	"volunteer",
	"references",
];
const fields: Record<string, string[]> = {
	experience: ["company", "position", "location", "period", "description"],
	education: ["school", "degree", "area", "grade", "location", "period", "description"],
	projects: ["name", "period", "description"],
	skills: ["name", "proficiency"],
	certifications: ["title", "issuer", "date", "description"],
	languages: ["language", "fluency"],
	publications: ["title", "publisher", "date", "description"],
	awards: ["title", "awarder", "date", "description"],
	volunteer: ["organization", "location", "period", "description"],
	references: ["name", "position", "phone", "description"],
};
const themes: Record<string, string> = {
	Arctic: "#276b89",
	Monochrome: "#222222",
	Indigo: "#5146a5",
	Forest: "#28795c",
	Slate: "#455a70",
	Warm: "#9a652a",
};
const label = (s: string) => s[0].toUpperCase() + s.slice(1);
const fresh = () => {
	const d = structuredClone(defaultResumeData);
	d.picture.hidden = true;
	d.metadata.template = "onyx";
	d.metadata.typography.body.fontFamily = "Helvetica";
	d.metadata.typography.heading.fontFamily = "Helvetica";
	d.metadata.design.colors.primary = themes.Arctic;
	d.metadata.layout.pages = [{ fullWidth: true, main: ["summary", ...sections], sidebar: [] }];
	for (const key of sections) d.sections[key].title = label(key);
	d.summary.title = "Professional summary";
	return d;
};

function database() {
	return new Promise<IDBDatabase>((resolve, reject) => {
		const req = indexedDB.open("trendy-cv", 1);
		req.onupgradeneeded = () => req.result.createObjectStore("documents");
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}
async function stored(value?: unknown) {
	const db = await database();
	try {
		return await new Promise((resolve, reject) => {
			const tx = db.transaction("documents", value === undefined ? "readonly" : "readwrite");
			const store = tx.objectStore("documents");
			const req = value === undefined ? store.get("current") : store.put(value, "current");
			tx.oncomplete = () => resolve(req.result);
			tx.onerror = () => reject(tx.error);
		});
	} finally {
		db.close();
	}
}
function download(blob: Blob, name: string) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = name;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function LegacyEditor() {
	const [data, setData] = useState(fresh);
	const [ready, setReady] = useState(false);
	const [section, setSection] = useState("basics");
	const [status, setStatus] = useState("Opening local draft…");
	const [pdf, setPdf] = useState("");
	const [busy, setBusy] = useState(false);
	const [family, setFamily] = useState("simple");
	const [theme, setTheme] = useState("Arctic");
	const [ai, setAi] = useState<{ text: string; apply: (value: string) => void } | null>(null);
	const [proposal, setProposal] = useState("");
	const [aiBusy, setAiBusy] = useState(false);
	const [instruction, setInstruction] = useState("Improve clarity and concision without adding facts.");
	const requestRef = React.useRef<AbortController | null>(null);
	useEffect(() => {
		stored()
			.then((value) => {
				const v = value as { data: unknown; family?: string; theme?: string } | undefined;
				if (v) {
					setData(parseResumeData(v.data));
					setFamily(v.family || "simple");
					setTheme(v.theme || "Arctic");
				}
				setStatus("Saved only in this browser");
			})
			.catch(() => setStatus("Could not restore draft. Import a JSON backup if available."))
			.finally(() => setReady(true));
	}, []);
	useEffect(() => {
		if (!ready) return;
		const timer = setTimeout(() => {
			stored({ data, family, theme })
				.then(() => setStatus("Draft saved locally"))
				.catch(() => setStatus("Autosave failed — export a JSON backup."));
		}, 400);
		return () => clearTimeout(timer);
	}, [data, family, theme, ready]);
	useEffect(
		() => () => {
			if (pdf) URL.revokeObjectURL(pdf);
		},
		[pdf],
	);
	const update = (fn: (d: typeof data) => void) => {
		setPdf("");
		setData((old) => {
			const d = structuredClone(old);
			fn(d);
			return d;
		});
	};
	async function render() {
		setBusy(true);
		setStatus("Rendering PDF locally…");
		try {
			const { createResumePdfBlob } = await import("@reactive-resume/pdf/browser");
			const blob = await createResumePdfBlob({ data });
			setPdf(URL.createObjectURL(blob));
			setStatus("PDF preview ready. Export uses the same document.");
		} catch (e) {
			setStatus(`PDF failed: ${e.message}`);
		} finally {
			setBusy(false);
		}
	}
	async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (!file) return;
		try {
			if (file.size > 2000000) throw Error("File exceeds 2 MB");
			const raw = await file.text();
			const v = JSON.parse(raw);
			const next = v.metadata || v.data ? parseResumeData(v.data || v) : parseJSONResume(raw);
			if (confirm("Replace your current draft?")) {
				setData(next);
				setFamily(v.family || "simple");
				setTheme(v.theme || "Arctic");
				setPdf("");
			}
		} catch (err) {
			setStatus(`Import failed: ${err.message}`);
		}
		e.target.value = "";
	}
	function chooseFamily(value: string) {
		setFamily(value);
		update((d) => {
			d.metadata.template = value === "advanced" ? "azurill" : "onyx";
			d.metadata.layout.pages =
				value === "advanced"
					? [
							{
								fullWidth: false,
								main: ["summary", "experience", "education", "projects", "publications", "volunteer"],
								sidebar: ["skills", "certifications", "languages", "awards", "references"],
							},
						]
					: [{ fullWidth: true, main: ["summary", ...sections], sidebar: [] }];
			if (value === "multipage")
				d.metadata.layout.pages = [
					{ fullWidth: true, main: ["summary", "experience", "education", "skills"], sidebar: [] },
					{
						fullWidth: true,
						main: ["projects", "certifications", "languages", "publications", "awards", "volunteer", "references"],
						sidebar: [],
					},
				];
		});
	}
	function addItem() {
		update((d) => {
			const item: Record<string, unknown> = {
				id: crypto.randomUUID(),
				hidden: false,
				website: { url: "", label: "", inlineLink: false },
				icon: "",
				iconColor: "",
				level: 0,
				keywords: [],
				roles: [],
			};
			for (const field of fields[section]) item[field] = "";
			d.sections[section].items.push(item);
		});
	}
	const input = (name: string, value: string, change: (v: string) => void, long = false) => (
		<div key={name}>
			{long ? (
				<label>
					{label(name)}
					<textarea value={value || ""} onChange={(e) => change(e.target.value)} rows={5} />
				</label>
			) : (
				<label>
					{label(name)}
					<input value={value || ""} onChange={(e) => change(e.target.value)} />
				</label>
			)}
			{long && (
				<button
					type="button"
					disabled={!value?.trim()}
					onClick={() => {
						setAi({ text: value, apply: change });
						setProposal("");
					}}
				>
					Improve selected text with AI
				</button>
			)}
		</div>
	);
	return (
		<>
			<header>
				<a href="/">← Trendy Tools</a>
				<strong>Trendy CV</strong>
				<span>YOUR STORY, BEAUTIFULLY TOLD</span>
			</header>
			<div className="toolbar">
				<select aria-label="Template family" value={family} onChange={(e) => chooseFamily(e.target.value)}>
					<option value="simple">Simple · single column</option>
					<option value="advanced">Advanced · sidebar</option>
					<option value="multipage">Multi-page · professional CV</option>
				</select>
				<select
					aria-label="Theme"
					value={theme}
					onChange={(e) => {
						setTheme(e.target.value);
						update((d) => {
							d.metadata.design.colors.primary = themes[e.target.value];
						});
					}}
				>
					{Object.keys(themes).map((t) => (
						<option key={t}>{t}</option>
					))}
				</select>
				<select
					aria-label="Paper size"
					value={data.metadata.page.format}
					onChange={(e) =>
						update((d) => {
							d.metadata.page.format = e.target.value;
						})
					}
				>
					<option value="a4">A4</option>
					<option value="letter">US Letter</option>
				</select>
				<button
					type="button"
					onClick={() =>
						download(
							new Blob([JSON.stringify({ version: 1, data, family, theme }, null, 2)], { type: "application/json" }),
							"trendy-cv.json",
						)
					}
				>
					Export JSON
				</button>
				<label className="file">
					Import JSON
					<input
						type="file"
						accept=".json"
						onChange={async (e) => {
							const f = e.target.files?.[0];
							if (!f) return;
							try {
								if (f.size > 2000000) throw Error("File exceeds 2 MB");
								const v = JSON.parse(await f.text());
								const next = parseResumeData(v.data || v);
								if (confirm("Replace your current draft?")) {
									setData(next);
									setFamily(v.family || "simple");
									setTheme(v.theme || "Arctic");
									setPdf("");
								}
							} catch (err) {
								setStatus(`Import failed: ${err.message}`);
							}
							e.target.value = "";
						}}
					/>
				</label>
			</div>
			<div className="toolbar">
				<label>
					Template design
					<select
						value={data.metadata.template}
						onChange={(e) =>
							update((d) => {
								d.metadata.template = e.target.value;
							})
						}
					>
						{templateSchema.options.map((t) => (
							<option key={t} value={t}>
								{label(t)}
							</option>
						))}
					</select>
				</label>
				<label>
					Font
					<select
						value={data.metadata.typography.body.fontFamily}
						onChange={(e) =>
							update((d) => {
								d.metadata.typography.body.fontFamily = e.target.value;
								d.metadata.typography.heading.fontFamily = e.target.value;
							})
						}
					>
						{["Helvetica", "Times-Roman", "Courier"].map((t) => (
							<option key={t}>{t}</option>
						))}
					</select>
				</label>
				<label>
					Body size
					<input
						type="number"
						min={9}
						max={16}
						value={data.metadata.typography.body.fontSize}
						onChange={(e) =>
							update((d) => {
								d.metadata.typography.body.fontSize = Math.max(9, Math.min(16, Number(e.target.value) || 10));
							})
						}
					/>
				</label>
				<label className="file">
					Import JSON Resume
					<input type="file" accept=".json" onChange={importFile} />
				</label>
			</div>
			<main>
				<nav>
					{["basics", "summary", ...sections, "layout"].map((s) => (
						<button type="button" key={s} className={section === s ? "selected" : ""} onClick={() => setSection(s)}>
							{label(s)}
						</button>
					))}
				</nav>
				<section className="editor">
					<h1>{label(section)}</h1>
					<p className="muted">Build your CV here. Keep factual details accurate and save a JSON backup.</p>
					{section === "basics" &&
						["name", "headline", "email", "phone", "location"].map((f) =>
							input(f, data.basics[f], (v) =>
								update((d) => {
									d.basics[f] = v;
								}),
							),
						)}
					{section === "summary" &&
						input(
							"summary",
							data.summary.content,
							(v) =>
								update((d) => {
									d.summary.content = v;
								}),
							true,
						)}
					{fields[section] && (
						<>
							<label className="check">
								<input
									type="checkbox"
									checked={!data.sections[section].hidden}
									onChange={(e) =>
										update((d) => {
											d.sections[section].hidden = !e.target.checked;
										})
									}
								/>
								Show section
							</label>
							{data.sections[section].items.map((item: Record<string, string>, i: number) => (
								<article key={item.id}>
									<div className="entry-head">
										<strong>Entry {i + 1}</strong>
										<button
											type="button"
											onClick={() =>
												update((d) => {
													d.sections[section].items.splice(i, 1);
												})
											}
										>
											Remove
										</button>
									</div>
									{fields[section].map((f) =>
										input(
											f,
											item[f],
											(v) =>
												update((d) => {
													d.sections[section].items[i][f] = v;
												}),
											f === "description",
										),
									)}
								</article>
							))}
							<button type="button" onClick={addItem}>
								+ Add {label(section)} entry
							</button>
						</>
					)}
					{section === "layout" && (
						<>
							<p>
								Assign sections to pages. Each page can use main and sidebar columns. Review PDF output for overflow.
							</p>
							<button
								type="button"
								onClick={() =>
									update((d) => {
										d.metadata.layout.pages.push({ fullWidth: family !== "advanced", main: [], sidebar: [] });
									})
								}
							>
								+ Add page
							</button>
							{["summary", ...sections].map((s) => {
								const p = data.metadata.layout.pages.findIndex((p) => [...p.main, ...p.sidebar].includes(s));
								return (
									<label key={s}>
										{label(s)}
										<select
											value={p}
											onChange={(e) =>
												update((d) => {
													for (const pg of d.metadata.layout.pages) {
														pg.main = pg.main.filter((k) => k !== s);
														pg.sidebar = pg.sidebar.filter((k) => k !== s);
													}
													d.metadata.layout.pages[Number(e.target.value)].main.push(s);
												})
											}
										>
											{data.metadata.layout.pages.map((_, i) => (
												<option key={i} value={i}>
													Page {i + 1}
												</option>
											))}
										</select>
									</label>
								);
							})}
						</>
					)}
				</section>
				<aside>
					<div className="preview-head">
						<div>
							<h2>Print preview</h2>
							<p className="muted">{data.metadata.layout.pages.length} configured page(s)</p>
						</div>
						<button type="button" disabled={busy} onClick={render}>
							{busy ? "Rendering…" : "Refresh preview"}
						</button>
					</div>
					{pdf ? (
						<>
							<iframe title="CV PDF preview" src={pdf} />
							<a className="download" href={pdf} download="trendy-cv.pdf">
								Download PDF
							</a>
						</>
					) : (
						<div className="empty">
							Your next chapter starts here.
							<br />
							Fill in your details, then refresh the preview.
						</div>
					)}
					<p role="status">{status}</p>
				</aside>
			</main>
			<footer>Local-first · PDF templates adapted from Reactive Resume (MIT) · No account required</footer>
			{ai && (
				<div className="modal" role="dialog" aria-modal="true" aria-label="Review AI edit">
					<section>
						<h2>Improve selected text</h2>
						<p>
							Only the text below and your instruction go to your configured provider. Contact details and other
							sections are excluded.
						</p>
						<pre>{ai.text}</pre>
						<label>
							Instruction
							<textarea
								value={instruction}
								maxLength={2000}
								onChange={(e) => {
									requestRef.current?.abort();
									setInstruction(e.target.value);
									setProposal("");
								}}
							/>
						</label>
						<button
							type="button"
							disabled={aiBusy}
							onClick={async () => {
								const c = new AbortController();
								requestRef.current = c;
								setAiBusy(true);
								try {
									const text = await rewrite(ai.text, instruction, c.signal);
									if (!c.signal.aborted) setProposal(text);
								} catch (e) {
									if (!c.signal.aborted) setStatus(e.message);
								} finally {
									setAiBusy(false);
								}
							}}
						>
							{aiBusy ? "Drafting…" : "Send selected text and propose edit"}
						</button>
						{proposal && (
							<>
								<h3>Suggested replacement</h3>
								<pre>{proposal}</pre>
								<p>Check every fact before accepting.</p>
								<button
									type="button"
									onClick={() => {
										ai.apply(proposal);
										setAi(null);
										setProposal("");
									}}
								>
									Accept this edit
								</button>
							</>
						)}
						<button
							type="button"
							onClick={() => {
								requestRef.current?.abort();
								setAi(null);
								setProposal("");
							}}
						>
							Cancel
						</button>
						<p role="status">{status}</p>
					</section>
				</div>
			)}
		</>
	);
}
const root = document.getElementById("root");
if (root) createRoot(root).render(new URLSearchParams(location.search).has("legacy") ? <Wizard /> : <TargetPlanner />);
