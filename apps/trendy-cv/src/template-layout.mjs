export const hasContent = (value) => typeof value === "string" && value.trim().length > 0;

export function contentPages(cv, skills, format) {
	const present = {
		summary: hasContent(cv.summary),
		experience: hasContent(cv.experience),
		education: hasContent(cv.education),
		projects: hasContent(cv.additional),
		skills: skills.some(hasContent),
	};
	const pages =
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
	const filtered = pages
		.map((p) => ({ ...p, main: p.main.filter((k) => present[k]), sidebar: p.sidebar.filter((k) => present[k]) }))
		.filter((p) => p.main.length || p.sidebar.length);
	for (const p of filtered) if (!p.sidebar.length) p.fullWidth = true;
	return filtered.length ? filtered : [{ fullWidth: true, main: [], sidebar: [] }];
}
