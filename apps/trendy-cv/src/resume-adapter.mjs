import { escapeHTML, THEMES } from "./wizard-model.mjs";

export const TEMPLATES = {
	onyx: "Onyx — clean single column",
	azurill: "Azurill — modern sidebar",
	bronzor: "Bronzor — editorial",
};
export const ENTRY_FIELDS = {
	experience: {
		company: "Employer",
		position: "Role",
		period: "Dates",
		location: "Location",
		description: "Achievements (one per line)",
	},
	education: {
		school: "Institution",
		degree: "Qualification",
		area: "Subject",
		period: "Dates",
		description: "Details (one per line)",
	},
};
export function emptyEntry(kind) {
	return Object.fromEntries(Object.keys(ENTRY_FIELDS[kind]).map((key) => [key, ""]));
}
export function validateEntries(value) {
	if (value == null) return {};
	if (typeof value !== "object" || Array.isArray(value)) throw Error("Invalid saved structured entries");
	const result = {};
	for (const kind of Object.keys(ENTRY_FIELDS)) {
		const group = value[kind];
		if (!group) continue;
		if (typeof group.source !== "string" || !Array.isArray(group.items) || group.items.length > 100)
			throw Error("Invalid saved structured entries");
		result[kind] = {
			source: group.source,
			items: group.items.map((item) => {
				const next = emptyEntry(kind);
				for (const key of Object.keys(next)) {
					if (typeof item?.[key] !== "string" || item[key].length > 12000) throw Error("Invalid saved entry field");
					next[key] = item[key];
				}
				return next;
			}),
		};
	}
	return result;
}
const html = (text) => escapeHTML(text).replace(/\n/g, "<br>");
const bullets = (text) =>
	`<ul>${text
		.split("\n")
		.filter((s) => s.trim())
		.map((s) => `<li>${escapeHTML(s)}</li>`)
		.join("")}</ul>`;

export function toResumeData(defaults, cv, options, entries = {}) {
	const data = structuredClone(defaults);
	for (const key of ["name", "email", "phone", "location", "headline"]) data.basics[key] = cv[key];
	data.picture.hidden = true;
	data.summary = { ...data.summary, title: "Profile", content: html(cv.summary), hidden: !cv.summary.trim() };
	for (const section of Object.values(data.sections)) {
		section.items = [];
		section.hidden = true;
	}
	for (const kind of Object.keys(ENTRY_FIELDS)) {
		const group = entries[kind];
		const structured = group && group.source === cv[kind];
		const rows = structured ? group.items : cv[kind].trim() ? [{ ...emptyEntry(kind), description: cv[kind] }] : [];
		data.sections[kind].title = kind === "experience" ? "Experience" : "Education";
		data.sections[kind].items = rows
			.filter((row) => Object.values(row).some((v) => v.trim()))
			.map((row, i) => ({
				...(kind === "experience"
					? { company: "", position: "", roles: [] }
					: { school: "", degree: "", area: "", grade: "" }),
				location: "",
				period: "",
				...row,
				id: `${kind}-${i}`,
				hidden: false,
				...(kind === "experience"
					? { company: row.company.trim() || "Experience" }
					: { school: row.school.trim() || "Education" }),
				description: structured ? bullets(row.description) : html(row.description),
				website: { url: "", label: "", inlineLink: false },
			}));
	}
	data.sections.skills.title = "Skills";
	data.sections.skills.items = options.skills
		.filter((s) => s.trim())
		.map((name, i) => ({
			id: `skill-${i}`,
			name,
			hidden: false,
			proficiency: "",
			level: 0,
			keywords: [],
			icon: "",
			iconColor: "",
		}));
	data.sections.projects.title = "Additional information";
	if (cv.additional.trim())
		data.sections.projects.items = [
			{
				id: "additional",
				hidden: false,
				name: "Additional information",
				period: "",
				description: html(cv.additional),
				website: { url: "", label: "", inlineLink: false },
			},
		];
	for (const section of Object.values(data.sections)) section.hidden = !section.items.length;
	data.metadata.template = Object.hasOwn(TEMPLATES, options.template) ? options.template : "onyx";
	data.metadata.page.format = options.paper === "letter" ? "letter" : "a4";
	data.metadata.design.colors.primary = THEMES[options.theme] || THEMES.Arctic;
	data.metadata.typography.body.fontFamily = "Helvetica";
	data.metadata.typography.heading.fontFamily = "Helvetica";
	const present = ["summary", "experience", "education", "projects", "skills"].filter((key) =>
		key === "summary" ? !data.summary.hidden : !data.sections[key].hidden,
	);
	const sidebar = options.template === "azurill" && present.includes("skills");
	data.metadata.layout.pages = [
		{
			fullWidth: !sidebar,
			main: present.filter((key) => !sidebar || key !== "skills"),
			sidebar: sidebar ? ["skills"] : [],
		},
	];
	return data;
}
