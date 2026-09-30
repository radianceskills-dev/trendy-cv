# Trendy CV

## Guided wizard

CV extraction and professional review are separate actions. In paste mode, **Fill my details** calls only the JSON parser (with local JSON repair), fills the form and autosaves it. The user checks the form before explicitly clicking **Review with AI**. Review uses validated YAML with at most six targeted replacements or individual skill additions. All proposed personal-content changes require approval; stale suggestions are rejected. Users can skip professional review and proceed to format selection. Review failures preserve the populated form. Both stages retain the shared transport's request deadline and cancellation handling.

Run `node apps/trendy-cv/review.test.mjs` for YAML and patch validation coverage. The updated browser smoke test verifies extraction never automatically calls the reviewer.

The default entry point is now `src/Wizard.tsx`: target roles/titles/industries or pasted JD; structured form or plain-text CV; review and approve/dismiss missing-information suggestions; format/theme selection; editable HTML CV and PDF export. Target analysis starts in the background when leaving step one. All AI stages validate structured JSON. Formatting uses confirmed skill indices, so it can regroup/prioritize skills without inventing new ones. CV facts remain editable and extraction must be reviewed.

Wizard drafts use the separate `trendy-cv-wizard` IndexedDB database; existing editor drafts are not deleted. The previous editor remains in source as `LegacyEditor` while its advanced controls are migrated. Run `node apps/trendy-cv/wizard.test.mjs` and `node apps/trendy-cv/smoke.cjs` after building. The browser test covers both form and pasted-CV paths, contact exclusion from form review, approvals, invalid skill references, HTML editing, and PDF download.

The HTML editor and PDF exporter share content but currently use separate layout renderers; pixel-identical pagination is not guaranteed. The wizard exposes three format presets and six palettes; the old editor's 15-design selector is not currently exposed in the wizard.

Static, local-first CV editor built on Reactive Resume's MIT-licensed schema and PDF packages. Original source and licenses are retained in this repository.

## Run

Use Node 24 and pnpm 12.6.0 from the repository root:

```
pnpm install --filter trendy-cv...
pnpm --filter trendy-cv dev
pnpm --filter trendy-cv build
node apps/trendy-cv/smoke.cjs
```

Set `CHROME_BIN` for the browser test. Build output: `apps/trendy-cv/dist`. Public base: `/tools/cv-builder/`.

## Current functionality

- Local IndexedDB draft and JSON backup/import using the full Reactive Resume schema.
- Simple single-column (Onyx), advanced sidebar (Azurill), and two-page professional (Onyx) presets.
- Six independent color themes, A4/Letter paper, explicit section-to-page assignment.
- Browser PDF preview and download from the same PDF blob; refresh after edits.
- Selected-summary/description AI rewrites through shared `trendytools.ai.v1` settings. Explicit send and accept; other CV fields are excluded from the request.
- No account, server API, or database service required.

## Remaining work before release

- Broader template gallery, font/density controls, section ordering, page removal, custom sections and photo editing.
- JSON Resume interchange (current JSON backup is Reactive Resume-shaped).
- Automatic overflow management and PDF page-count/text-extraction tests.
- Mobile preview testing, stronger import sanitization, and complete AI transport tests.
- Owned GitHub remote and Trendy Tools deployment registration.

This app is not yet registered as a live dashboard tool.
