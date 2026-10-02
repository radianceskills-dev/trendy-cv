// Canonical app-owned registry. Field descriptors are runtime validation rules.
const text = "text";
const list = "list";
const date = "date";
const flag = "boolean";
const amount = "number";
const position = {
	organization: text,
	role: text,
	location: text,
	startDate: date,
	endDate: date,
	current: flag,
	description: text,
	highlights: list,
	links: list,
};
const define = (title, titles, fields) => ({ title, titles: [title, ...titles], fields });
export const SECTION_TYPES = {
	summary: define("Professional Summary", ["Summary", "Profile", "Executive Summary"], { text }),
	experience: define(
		"Work Experience",
		["Experience", "Professional Experience", "Employment History", "Career History"],
		position,
	),
	education: define("Education", ["Academic Background", "Academic Qualifications", "Degrees"], {
		institution: text,
		qualification: text,
		fieldOfStudy: text,
		location: text,
		startDate: date,
		endDate: date,
		inProgress: flag,
		grade: text,
		honors: list,
		thesisTitle: text,
		advisors: list,
		committeeMembers: list,
		description: text,
		links: list,
	}),
	skills: define("Skills", ["Expertise", "Technical Skills", "Tools & Technologies", "Toolkit", "Research Methods"], {
		label: text,
		skills: list,
		description: text,
	}),
	certifications: define(
		"Certifications & Professional Development",
		["Certifications", "Licenses & Certifications", "Professional Development", "Training & Development"],
		{ name: text, issuer: text, issueDate: date, expiryDate: date, credentialId: text, description: text, links: list },
	),
	projects: define(
		"Projects",
		["Selected Projects", "Technical Projects", "Research Projects", "Open-Source Projects"],
		{
			name: text,
			role: text,
			organization: text,
			startDate: date,
			endDate: date,
			current: flag,
			description: text,
			highlights: list,
			technologies: list,
			links: list,
		},
	),
	researchInterests: define("Research Interests", ["Research Focus", "Research Areas", "Research Agenda"], { text }),
	academicAppointments: define(
		"Academic Appointments",
		["Academic Positions", "Research Appointments", "Research Experience"],
		{
			institution: text,
			department: text,
			role: text,
			location: text,
			startDate: date,
			endDate: date,
			current: flag,
			advisors: list,
			description: text,
			highlights: list,
			links: list,
		},
	),
	publications: define(
		"Publications",
		["Selected Publications", "Journal Articles", "Books & Book Chapters", "Manuscripts"],
		{
			title: text,
			authors: list,
			highlightedAuthorIds: list,
			venue: text,
			year: date,
			volume: text,
			issue: text,
			pages: text,
			publicationKind: text,
			status: text,
			doi: text,
			links: list,
			citationText: text,
		},
	),
	funding: define("Grants & Funding", ["Research Funding", "Grants", "Funded Research"], {
		projectTitle: text,
		funder: text,
		scheme: text,
		role: text,
		startDate: date,
		endDate: date,
		status: text,
		totalAmount: amount,
		allocatedAmount: amount,
		currency: text,
		description: text,
		links: list,
	}),
	teaching: define("Teaching Experience", ["Teaching", "Courses Taught", "Teaching & Curriculum Development"], {
		courseTitle: text,
		courseCode: text,
		institution: text,
		role: text,
		terms: list,
		startDate: date,
		endDate: date,
		level: text,
		enrollment: amount,
		description: text,
		highlights: list,
		links: list,
	}),
	mentoring: define(
		"Mentoring & Supervision",
		["Mentoring", "Research Supervision", "Student Supervision", "Advising & Mentorship"],
		{
			personOrGroup: text,
			level: text,
			institution: text,
			role: text,
			startDate: date,
			endDate: date,
			projectTitle: text,
			status: text,
			outcome: text,
			description: text,
		},
	),
	presentations: define("Presentations & Talks", ["Presentations", "Invited Talks", "Conference Presentations"], {
		title: text,
		event: text,
		host: text,
		date,
		location: text,
		format: text,
		invited: flag,
		authors: list,
		description: text,
		links: list,
	}),
	service: define(
		"Academic & Professional Service",
		["Academic Service", "Professional Service", "Editorial Service"],
		{ ...position, category: text },
	),
	awards: define("Honors & Awards", ["Awards & Recognition", "Awards", "Academic Distinctions"], {
		name: text,
		issuer: text,
		date,
		description: text,
		links: list,
	}),
	custom: define("Additional Information", [], {
		title: text,
		subtitle: text,
		dateLabel: text,
		text,
		bullets: list,
		links: list,
	}),
};
export const PLANNABLE_TYPES = Object.keys(SECTION_TYPES).filter((key) => key !== "custom");
export function object(value, keys) {
	if (
		!value ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		Object.keys(value).some((key) => !keys.includes(key))
	)
		throw Error("Unexpected data fields.");
	return value;
}
export function string(value, max = 12000, required = false) {
	if (typeof value !== "string" || value.length > max || (required && !value.trim()))
		throw Error("Invalid or missing text.");
	return value;
}
export function strings(value, max = 100) {
	if (!Array.isArray(value) || value.length > max) throw Error("Invalid list.");
	return value.map((item) => string(item, 2000));
}
export function validateDate(value) {
	string(value, 500);
	if (!value) return value;
	if (!/^\d{4}(-\d{2})?(-\d{2})?$/.test(value)) throw Error("Dates must use YYYY, YYYY-MM or YYYY-MM-DD.");
	const [y, m = 1, d = 1] = value.split("-").map(Number);
	if (y < 1000 || m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate())
		throw Error("Invalid calendar date.");
	return value;
}
export function validateEntry(type, raw) {
	if (!Object.hasOwn(SECTION_TYPES, type)) throw Error("Unknown section type.");
	const fields = SECTION_TYPES[type].fields;
	object(raw, ["id", "originalDateLabel", ...Object.keys(fields)]);
	const entry = { id: string(raw.id, 100, true) };
	for (const [key, value] of Object.entries(raw)) {
		if (key === "id") continue;
		const kind = key === "originalDateLabel" ? "text" : fields[key];
		if (kind === "text") entry[key] = string(value);
		else if (kind === "list") entry[key] = strings(value);
		else if (kind === "date") entry[key] = validateDate(value);
		else if (kind === "boolean" && typeof value === "boolean") entry[key] = value;
		else if (kind === "number" && typeof value === "number" && Number.isFinite(value) && value >= 0) entry[key] = value;
		else throw Error(`Invalid ${key}.`);
	}
	if (entry.current && entry.endDate) throw Error("Current positions cannot have an end date.");
	if (entry.inProgress && entry.endDate) throw Error("In-progress education cannot have an end date.");
	if (
		type === "publications" &&
		entry.status &&
		!["published", "accepted", "inPress", "preprint", "underReview", "inPreparation"].includes(entry.status)
	)
		throw Error("Invalid publication status.");
	if (type === "funding" && entry.status && !["awarded", "pending", "notFunded"].includes(entry.status))
		throw Error("Invalid funding status.");
	if (
		entry.startDate &&
		entry.endDate &&
		entry.startDate.slice(0, Math.min(entry.startDate.length, entry.endDate.length)) >
			entry.endDate.slice(0, Math.min(entry.startDate.length, entry.endDate.length))
	)
		throw Error("End date precedes start date.");
	return entry;
}
export function hasEntryContent(entry) {
	return Object.entries(entry).some(
		([key, value]) =>
			key !== "id" &&
			(typeof value === "string"
				? !!value.trim()
				: typeof value === "number"
					? Number.isFinite(value)
					: Array.isArray(value)
						? value.some((v) => typeof v === "string" && v.trim())
						: false),
	);
}
export function visibleSections(sections) {
	return sections.filter((section) => !section.hidden && section.items.some(hasEntryContent));
}
