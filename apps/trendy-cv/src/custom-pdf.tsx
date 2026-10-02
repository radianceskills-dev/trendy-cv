import { Document, Image, Page, pdf, Text, View } from "@react-pdf/renderer";
import { visibleSections } from "./section-model.mjs";
import { validateDraft } from "./target-plan.mjs";
import { entryBlocks, TEMPLATE_CATALOG } from "./template-catalog.mjs";

// One renderer for preview and download; plain strings are never interpreted as HTML.
export async function createCustomPDF(
	input: Parameters<typeof validateDraft>[0],
	template: string,
	paper: "a4" | "letter",
) {
	const draft = validateDraft(input);
	const config = TEMPLATE_CATALOG[template];
	if (!config) throw Error("Unknown template");
	const studio = template === "studio";
	const chronicle = template === "chronicle";
	const scholar = template === "scholar";
	const blueprint = template === "blueprint";
	const accent = config.accent;
	const photo = draft.photo ? new Uint8Array(await draft.photo.arrayBuffer()) : null;
	const sections = visibleSections(draft.sections);
	const bodyFont = scholar ? "Times-Roman" : "Helvetica";
	const boldFont = scholar ? "Times-Bold" : "Helvetica-Bold";
	function renderSection(section: (typeof sections)[number]) {
		return (
			<View key={section.id} style={{ marginBottom: 14 }}>
				<Text
					minPresenceAhead={32}
					style={{
						fontFamily: boldFont,
						fontSize: 10.5,
						color: accent,
						letterSpacing: 0.8,
						borderBottomWidth: 0.6,
						borderBottomColor: accent,
						paddingBottom: 5,
						marginBottom: 8,
					}}
				>
					{section.title.toUpperCase()}
				</Text>
				{section.items.map((item) => {
					const block = entryBlocks(section.type, item);
					if (!block.title && !block.period && !block.lines.length) return null;
					return (
						<View
							key={item.id}
							style={{
								marginBottom: 10,
								...(chronicle ? { borderLeftWidth: 1, borderLeftColor: "#ddc7b9", paddingLeft: 10 } : {}),
							}}
						>
							{!!block.period && (
								<Text minPresenceAhead={20} style={{ fontSize: 8.5, color: accent, marginBottom: 3 }}>
									{block.period}
								</Text>
							)}
							{!!block.title && (
								<Text minPresenceAhead={18} style={{ fontFamily: boldFont, fontSize: 11, marginBottom: 4 }}>
									{block.title}
								</Text>
							)}
							{block.lines.map((line, index) => (
								<Text key={index} orphans={2} widows={2} style={{ marginBottom: 3 }}>
									{line.bullet ? "• " : ""}
									{line.label ? `${line.label}: ` : ""}
									{line.text}
								</Text>
							))}
						</View>
					);
				})}
			</View>
		);
	}
	const header = (
		<View
			wrap={false}
			style={{
				flexDirection: "row",
				justifyContent: "space-between",
				alignItems: "center",
				gap: 18,
				padding: studio ? 20 : 0,
				paddingBottom: 18,
				marginBottom: 20,
				backgroundColor: studio ? accent : "transparent",
				borderBottomWidth: studio ? 0 : 1.5,
				borderBottomColor: accent,
				...(blueprint ? { borderLeftWidth: 4, borderLeftColor: accent, paddingLeft: 16 } : {}),
			}}
		>
			<View style={{ flex: 1 }}>
				<Text
					style={{
						fontFamily: scholar ? "Times-Roman" : boldFont,
						fontSize: studio ? 30 : 27,
						color: studio ? "white" : "#20313b",
						marginBottom: 7,
					}}
				>
					{draft.header.name}
				</Text>
				{!!draft.header.professionalTitle && (
					<Text style={{ fontSize: 12, marginBottom: 8, color: studio ? "#d7eee5" : accent }}>
						{draft.header.professionalTitle}
					</Text>
				)}
				<Text style={{ fontSize: 9, color: studio ? "white" : "#50606a" }}>
					{[draft.header.location, draft.header.email, draft.header.phone, ...draft.header.links]
						.filter(Boolean)
						.join(" · ")}
				</Text>
			</View>
			{photo && (
				<Image
					src={{ data: photo, format: "jpg" }}
					style={{ width: 70, height: 70, objectFit: "cover", borderRadius: chronicle || scholar ? 35 : 4 }}
				/>
			)}
		</View>
	);
	// Only use the rail if it preserves the canonical reading/section order.
	const railStart = studio ? sections.findIndex((s) => s.type === "skills") : -1;
	const useRail =
		railStart > 0 && sections.slice(railStart).every((s) => ["skills", "education", "certifications"].includes(s.type));
	const document = (
		<Document title={draft.header.name} author={draft.header.name}>
			<Page
				size={paper === "letter" ? "LETTER" : "A4"}
				style={{
					fontFamily: bodyFont,
					fontSize: 10,
					lineHeight: 1.4,
					paddingTop: 38,
					paddingBottom: 42,
					paddingHorizontal: 42,
					backgroundColor: chronicle ? "#fffdfa" : "white",
					color: "#26343d",
				}}
			>
				{header}
				{useRail ? (
					<View style={{ flexDirection: "row", gap: 22 }}>
						<View style={{ width: "68%" }}>{sections.slice(0, railStart).map(renderSection)}</View>
						<View style={{ width: "28%", borderLeftWidth: 0.6, borderLeftColor: "#c7d8d1", paddingLeft: 12 }}>
							{sections.slice(railStart).map(renderSection)}
						</View>
					</View>
				) : (
					sections.map(renderSection)
				)}
				<Text
					fixed
					style={{ position: "absolute", bottom: 20, right: 42, fontSize: 8, color: "#667780" }}
					render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
				/>
			</Page>
		</Document>
	);
	return pdf(document).toBlob();
}
