import { SECTION_TYPES, visibleSections } from "./section-model.mjs";

export const TEMPLATE_CATALOG = {
	studio: {
		name: "Studio",
		description: "Deep green masthead and supporting skills rail",
		accent: "#184e44",
	},
	chronicle: {
		name: "Chronicle",
		description: "Warm paper, copper rules and career dates",
		accent: "#99593e",
	},
	precision: {
		name: "Precision",
		description: "Clean single-column professional résumé",
		accent: "#25566a",
	},
	blueprint: {
		name: "Blueprint",
		description: "Structured technical résumé with blue accents",
		accent: "#345cb1",
	},
	scholar: {
		name: "Scholar",
		description: "Serif academic CV with flowing research sections",
		accent: "#564c70",
	},
};
export function templateEligibility(draft, template) {
	const config = TEMPLATE_CATALOG[template];
	if (!config) return { eligible: false, reason: "Unknown template" };
	const sections = visibleSections(draft.sections);
	if (!sections.length) return { eligible: false, reason: "Add content to a planned section first." };
	if (sections.some((s) => !Object.hasOwn(SECTION_TYPES, s.type) || s.type === "custom"))
		return { eligible: false, reason: "Unsupported section type." };
	return { eligible: true, reason: "" };
}
export function entryBlocks(type, item) {
	const used = new Set(["id"]);
	const take = (...keys) =>
		keys
			.map((key) => {
				used.add(key);
				return typeof item[key] === "string" ? item[key].trim() : "";
			})
			.filter(Boolean)
			.join(" · ");
	const title = take(
		...({
			experience: ["role", "organization"],
			education: ["qualification", "fieldOfStudy", "institution"],
			academicAppointments: ["role", "institution", "department"],
			publications: ["title"],
			funding: ["projectTitle", "funder"],
			teaching: ["courseCode", "courseTitle", "institution"],
			mentoring: ["personOrGroup", "role"],
			presentations: ["title", "event"],
			service: ["role", "organization"],
			awards: ["name", "issuer"],
			certifications: ["name", "issuer"],
			projects: ["name", "role"],
			skills: ["label"],
		}[type] || []),
	);
	const dates = take("startDate", "endDate");
	used.add("current");
	used.add("inProgress");
	const period = [dates, item.current || item.inProgress ? "Present" : ""].filter(Boolean).join(" · ");
	const lines = [];
	for (const [key, value] of Object.entries(item)) {
		if (used.has(key)) continue;
		const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
		if (Array.isArray(value)) {
			for (const line of value.filter((s) => typeof s === "string" && s.trim()))
				lines.push({
					text: line,
					label: key === "highlights" || key === "bullets" ? "" : label,
					bullet: key === "highlights" || key === "bullets",
				});
		} else if (typeof value === "string" && value.trim())
			lines.push({
				text: value,
				label: ["text", "description", "citationText"].includes(key) ? "" : label,
				bullet: false,
			});
		else if (typeof value === "number") lines.push({ text: String(value), label, bullet: false });
		else if (value === true) lines.push({ text: "Yes", label, bullet: false });
	}
	return { title, period, lines };
}
export const pdfFileName = (name) =>
	`${
		name
			.trim()
			.split("")
			.map((char) => (char.charCodeAt(0) < 32 ? "-" : char))
			.join("")
			.replace(/[<>:"/\\|?*]/g, "-")
			.replace(/[. ]+$/g, "")
			.slice(0, 100) || "CV"
	}.pdf`;
