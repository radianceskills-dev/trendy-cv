import type { newDraft } from "./target-plan.mjs";
import { useEffect, useRef, useState } from "react";
import { requestJSON } from "./ai";
import {
	applyExtraction,
	contentKey,
	EXTRACTION_PROMPT,
	extractionInput,
	legacySource,
	restoreLegacySections,
	stageExtraction,
} from "./section-content.mjs";
import { hasEntryContent, SECTION_TYPES, validateEntry, visibleSections } from "./section-model.mjs";
import { validateDraft } from "./target-plan.mjs";

type Draft = ReturnType<typeof newDraft>;
type Entry = Record<string, string | string[] | number | boolean> & { id: string };
const labels: Record<string, string> = {
	organization: "Company / workplace",
	role: "Role / job title",
	institution: "Institution",
	qualification: "Qualification",
	fieldOfStudy: "Field of study",
	startDate: "Start date",
	endDate: "End date",
	current: "Currently working here",
	inProgress: "Currently studying",
	description: "Description",
	highlights: "Responsibilities / achievements",
	originalDateLabel: "Original date wording",
	professionalTitle: "Professional title",
	text: "Content",
};
const labelFor = (key: string) => labels[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());

type FieldProps = {
	name: string;
	kind: string;
	value: unknown;
	onChange: (v: unknown) => void;
	disabled?: boolean;
	options?: string[];
};
function ContentField({ name, kind, value, onChange, disabled, options }: FieldProps) {
	if (kind === "boolean")
		return (
			<label>
				<input
					aria-label={name}
					type="checkbox"
					checked={value === true}
					disabled={disabled}
					onChange={(e) => onChange(e.target.checked)}
				/>
				{name}
			</label>
		);
	if (options)
		return (
			<label>
				{name}
				<select aria-label={name} value={String(value || "")} onChange={(e) => onChange(e.target.value)}>
					<option value="">Not specified</option>
					{options.map((option) => (
						<option key={option}>{option}</option>
					))}
				</select>
			</label>
		);
	return (
		<label>
			{name}
			{kind === "date" && <small> — YYYY, YYYY-MM or YYYY-MM-DD</small>}
			{kind === "list" && <small> — one item per line</small>}
			<textarea
				aria-label={name}
				disabled={disabled}
				rows={kind === "list" || /Description|Content|Citation/.test(name) ? 4 : 2}
				maxLength={kind === "list" || name === "Existing CV text" ? 50000 : 12000}
				value={Array.isArray(value) ? value.join("\n") : String(value ?? "")}
				onChange={(e) =>
					onChange(
						kind === "list"
							? e.target.value.split("\n")
							: kind === "number"
								? e.target.value === ""
									? undefined
									: Number(e.target.value)
								: e.target.value,
					)
				}
			/>
		</label>
	);
}
type EntryProps = {
	type: string;
	item: Entry;
	index: number;
	onSave: (item: Entry) => void;
	onDirty: (id: string, dirty: boolean) => void;
};
function EntryFields({ type, item, index, onSave, onDirty }: EntryProps) {
	const [buffer, setBuffer] = useState(item);
	const [error, setError] = useState("");
	function edit(key: string, value: unknown) {
		const next = { ...buffer, [key]: value };
		if (value === undefined) delete next[key];
		if ((key === "current" || key === "inProgress") && value) delete next.endDate;
		setBuffer(next);
		try {
			const validated = validateEntry(type, next);
			onSave(validated);
			onDirty(item.id, false);
			setError("");
		} catch (e) {
			onDirty(item.id, true);
			setError(e instanceof Error ? e.message : "Invalid field");
		}
	}
	return (
		<fieldset>
			<legend>Entry {index + 1}</legend>
			{Object.entries({ ...SECTION_TYPES[type].fields, originalDateLabel: "text" }).map(([key, kind]) => (
				<ContentField
					key={key}
					name={`${labelFor(key)} (${index + 1})`}
					kind={String(kind)}
					value={buffer[key]}
					onChange={(value) => edit(key, value)}
					disabled={key === "endDate" && (buffer.current === true || buffer.inProgress === true)}
					options={
						key === "status"
							? type === "publications"
								? ["published", "accepted", "inPress", "preprint", "underReview", "inPreparation"]
								: type === "funding"
									? ["awarded", "pending", "notFunded"]
									: undefined
							: undefined
					}
				/>
			))}
			{error && <p role="alert">{error} This entry's latest edit is not saved until corrected.</p>}
		</fieldset>
	);
}
export function SectionEditor({
	draft,
	onChange,
	onConfirm,
}: {
	draft: Draft;
	onChange: (draft: Draft) => void;
	onConfirm: (draft: Draft) => Promise<void>;
}) {
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [staged, setStaged] = useState<ReturnType<typeof stageExtraction> | null>(null);
	const [undo, setUndo] = useState<{ sectionId: string; item: Entry; index: number } | null>(null);
	const [dirty, setDirty] = useState<Record<string, boolean>>({});
	const [editorVersion, setEditorVersion] = useState(0);
	const controller = useRef<AbortController | null>(null);
	const run = useRef(0);
	const latest = useRef(draft);
	latest.current = draft;
	useEffect(
		() => () => {
			controller.current?.abort();
			run.current++;
		},
		[],
	);
	const blocked = Object.values(dirty).some(Boolean);
	function cancel() {
		run.current++;
		controller.current?.abort();
		setBusy(false);
	}
	function change(next: Draft) {
		cancel();
		setStaged(null);
		setError("");
		onChange({ ...next, factsConfirmed: false });
	}
	function items(sectionId: string, next: Entry[]) {
		change({ ...draft, sections: draft.sections.map((s) => (s.id === sectionId ? { ...s, items: next } : s)) });
	}
	async function extract() {
		cancel();
		setError("");
		setStaged(null);
		const snapshot = draft;
		const id = run.current;
		const c = new AbortController();
		controller.current = c;
		try {
			const input = extractionInput(snapshot);
			setBusy(true);
			const result = await requestJSON(EXTRACTION_PROMPT, input, c.signal);
			if (c.signal.aborted || run.current !== id || contentKey(latest.current) !== contentKey(snapshot)) return;
			setStaged(stageExtraction(result, snapshot));
		} catch (e) {
			if (!c.signal.aborted) setError(e instanceof Error ? e.message : "Extraction failed");
		} finally {
			if (run.current === id) setBusy(false);
		}
	}
	return (
		<section style={{ marginTop: 24 }}>
			<h2>Add and review your information</h2>
			<p>
				Add entries inside the planned sections. Empty sections are omitted from the final CV. Changes save locally when
				valid.
			</p>
			{error && <p role="alert">{error}</p>}
			<fieldset disabled={confirming}>
				<details>
					<summary>Paste an existing CV</summary>
					<p>
						Your pasted text, including any contact details it contains, is sent to your configured AI provider.
						Extraction only fills the planned sections. Original text is retained locally.
					</p>
					<ContentField
						name="Existing CV text"
						kind="text"
						value={draft.rawText}
						onChange={(v) => change({ ...draft, rawText: String(v) })}
					/>
					<button type="button" disabled={busy || blocked} onClick={extract}>
						Extract into planned sections
					</button>
					{busy && (
						<>
							<p role="status">Extracting fields…</p>
							<button type="button" onClick={cancel}>
								Cancel extraction
							</button>
						</>
					)}
					{staged && (
						<div>
							<h3>Review extracted replacement</h3>
							<p>
								Applying replaces only the listed sections and supplied identity fields. Other sections stay unchanged.
								Check every value before applying.
							</p>
							{Object.keys(staged.header).length > 0 && (
								<details open>
									<summary>Personal details: current → extracted</summary>
									<pre className="source-text">
										{JSON.stringify({ current: draft.header, extracted: staged.header }, null, 2)}
									</pre>
								</details>
							)}
							{staged.sections.map((s) => (
								<details key={s.id} open>
									<summary>{draft.sections.find((x) => x.id === s.id)?.title}: current → extracted</summary>
									<pre className="source-text">
										{JSON.stringify(
											{ current: draft.sections.find((x) => x.id === s.id)?.items, extracted: s.items },
											null,
											2,
										)}
									</pre>
								</details>
							))}
							<button
								type="button"
								onClick={() => {
									try {
										change(applyExtraction(draft, staged));
										setUndo(null);
										setEditorVersion((v) => v + 1);
									} catch (e) {
										setError(e instanceof Error ? e.message : "Cannot apply extraction");
									}
								}}
							>
								Apply reviewed extraction
							</button>
							<button type="button" onClick={() => setStaged(null)}>
								Discard extraction
							</button>
						</div>
					)}
				</details>
				{draft.legacyBackup && (
					<details>
						<summary>Previous CV draft</summary>
						<p>
							Your original is preserved. Restore matching summary, skills, experience and education into empty planned
							sections, or use the old text for extraction.
						</p>
						<pre className="source-text">{legacySource(draft)}</pre>
						<button
							type="button"
							disabled={blocked}
							onClick={() => {
								try {
									change(restoreLegacySections(draft));
									setEditorVersion((v) => v + 1);
								} catch (e) {
									setError(e instanceof Error ? e.message : "Restore failed");
								}
							}}
						>
							Restore matching legacy entries
						</button>
						<button type="button" onClick={() => change({ ...draft, rawText: legacySource(draft) })}>
							Use previous text for extraction
						</button>
					</details>
				)}
				<details open>
					<summary>Personal details</summary>
					{Object.keys(draft.header).map((key) => (
						<ContentField
							key={key}
							name={labelFor(key)}
							kind={key === "links" ? "list" : "text"}
							value={draft.header[key]}
							onChange={(value) => {
								try {
									const next = validateDraft({ ...draft, header: { ...draft.header, [key]: value } });
									change(next);
								} catch (e) {
									setError(e instanceof Error ? e.message : "Invalid personal details");
								}
							}}
						/>
					))}
				</details>
				{draft.sections.map((section) => (
					<details key={section.id} open>
						<summary>
							{section.title} · {section.items.filter(hasEntryContent).length} entries
						</summary>
						<p>{section.items.some(hasEntryContent) ? "Included in your CV" : "Empty — omitted from your CV"}</p>
						{section.items.map((item, index) => (
							<div key={`${editorVersion}-${item.id}`} className="section-entry">
								<EntryFields
									type={section.type}
									item={item}
									index={index}
									onSave={(updated) =>
										items(
											section.id,
											section.items.map((x) => (x.id === item.id ? updated : x)),
										)
									}
									onDirty={(id, value) => {
										if (value) {
											cancel();
											setStaged(null);
											if (draft.factsConfirmed) onChange({ ...draft, factsConfirmed: false });
										}
										setDirty((old) => ({ ...old, [id]: value }));
									}}
								/>
								<button
									type="button"
									disabled={index === 0 || blocked}
									onClick={() => {
										const next = [...section.items];
										[next[index - 1], next[index]] = [next[index], next[index - 1]];
										items(section.id, next);
									}}
								>
									Move entry {index + 1} up
								</button>
								<button
									type="button"
									disabled={index === section.items.length - 1 || blocked}
									onClick={() => {
										const next = [...section.items];
										[next[index + 1], next[index]] = [next[index], next[index + 1]];
										items(section.id, next);
									}}
								>
									Move entry {index + 1} down
								</button>
								<button
									type="button"
									onClick={() => {
										setUndo({ sectionId: section.id, item, index });
										setDirty((old) => ({ ...old, [item.id]: false }));
										items(
											section.id,
											section.items.filter((x) => x.id !== item.id),
										);
									}}
								>
									Remove entry {index + 1}
								</button>
							</div>
						))}
						<button
							type="button"
							disabled={section.items.length >= (section.type === "summary" ? 1 : 100)}
							onClick={() => items(section.id, [...section.items, { id: crypto.randomUUID() }])}
						>
							Add {section.title} entry
						</button>
					</details>
				))}
				{undo && (
					<button
						type="button"
						onClick={() => {
							const section = draft.sections.find((s) => s.id === undo.sectionId);
							if (!section || section.items.length >= (section.type === "summary" ? 1 : 100)) {
								setError("Remove an entry before restoring this one.");
								return;
							}
							const next = [...section.items];
							next.splice(undo.index, 0, undo.item);
							items(section.id, next);
							setUndo(null);
						}}
					>
						Undo last removal
					</button>
				)}
			</fieldset>
			<p>{visibleSections(draft.sections).length} nonempty sections ready for your CV.</p>
			{blocked && <p role="alert">Correct unsaved entry fields before extracting or confirming.</p>}
			<button
				type="button"
				disabled={
					blocked ||
					busy ||
					confirming ||
					!!staged ||
					!draft.header.name.trim() ||
					!visibleSections(draft.sections).length
				}
				onClick={async () => {
					setConfirming(true);
					try {
						await onConfirm(validateDraft({ ...draft, factsConfirmed: true }));
					} catch (e) {
						setError(e instanceof Error ? e.message : "Confirmation save failed");
					} finally {
						setConfirming(false);
					}
				}}
			>
				{confirming ? "Saving confirmed facts…" : "My details are ready"}
			</button>
			<p className="muted">Enter your name and at least one nonempty section to confirm.</p>
			{draft.factsConfirmed && (
				<p role="status">
					Facts confirmed and saved. Keyword-based optimization is the next implementation phase. You can still edit;
					editing clears this confirmation.
				</p>
			)}
		</section>
	);
}
