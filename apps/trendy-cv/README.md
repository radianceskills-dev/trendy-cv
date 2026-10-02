# Trendy CV

## Section model and target-planning preview

Phase C now connects accepted plans to `SectionEditor.tsx`: personal details, registry-driven fields for all 15 standard types, repeatable entries, reordering, removal/undo and a persisted factual-confirmation checkpoint. Invalid entry edits stay in the current form buffer and show an unsaved error until corrected; confirmation and extraction are blocked while these exist. Original dates can be retained as wording alongside normalized dates.

`section-content.mjs` validates staged extraction against fixed planned section IDs, assigns fresh local entry IDs, and replaces only explicitly reviewed sections/identity fields. Manual edits cancel extraction and invalidate pending proposals; snapshots also reject stale application. Original pasted text is saved locally. Legacy matching entries can be explicitly restored into empty sections without guessing missing dates or organizations.

Schema version 3 adds `rawText` and `factsConfirmed`; version-2 drafts upgrade on load. Further edits reset factual confirmation. The new flow ends after confirming facts; optimization, photo selection, custom templates and named export remain future phases. Run `section-content.test.mjs` in addition to target-plan tests; `planning-smoke.cjs` now covers content entry, validation, reorder/undo, extraction approval, reload and reconfirmation behavior.

The default entry now renders `TargetPlanner.tsx` (Phases A/B). Required desired jobs and industries lead to a reviewed AI keyword/section plan. Titles/JD are optional. Plan validation allows 15 standard section types, rejects custom/duplicate types, constrains initial titles, labels inferred keywords and checks JD evidence quotes. Acceptance persists a fixed plan and initializes empty typed sections. Section editing and downstream export are the next phase; the new flow explicitly ends after plan acceptance.

`section-model.mjs` owns field descriptors, entry validation, date precision and meaningful-content checks. `target-plan.mjs` owns normalized targets, strict plan contracts, version-2 draft validation and nondestructive legacy import. `plan-storage.ts` serializes IndexedDB writes in `trendy-cv-planner`. Existing `trendy-cv-wizard` records are retained; original content and structured overrides are copied into a migration backup, not automatically assigned into the new plan. Unsupported/corrupt saved drafts pause autosave.

Run `node --test apps/trendy-cv/target-plan.test.mjs` and, after building, `node apps/trendy-cv/planning-smoke.cjs`. The previous wizard remains available at `?legacy` for regression checks with `smoke.cjs`; it is not the new fixed-section workflow. Do not deploy this intermediate planner as a complete CV-building replacement without completing the later phases.

Static browser-first CV wizard built on Reactive Resume's retained MIT-licensed schema and PDF packages. Mounted at `/tools/cv-builder/`.

## Content and templates

Target analysis, extraction and reviewed professional suggestions remain separate. Extraction uses JSON with local repair; professional review uses validated YAML and explicit acceptance. Contact fields are excluded from form-based review. Credentials remain in browser-local shared AI settings.

After curation, users can create a CV without another AI call or optionally group confirmed skills with AI. Skill-group limits are independent from visual templates.

`src/resume-adapter.mjs` maps curated content and optional structured experience/education into Reactive Resume data. The initial comparison set exposes Onyx, Azurill and Bronzor, six palettes and A4/Letter. Templates flow onto additional PDF pages; the old forced two-page split is removed.

`TemplateBuilder.tsx` generates a debounced PDF in the browser. `PdfPages.tsx` renders that exact blob using lazy-loaded PDF.js, with accessible extracted page text. Download uses the same blob; edits disable stale downloads until regeneration finishes. Old render results are discarded and object URLs are released.

Experience/education entries support separate organization, role/qualification, dates and description bullets. Original curated text remains available. Old drafts render their original text without guessing structure. If source text changes, saved structured overrides become inactive until checked and explicitly reactivated. Missing organization fields use generic section labels required by the upstream schema.

Wizard IndexedDB (`trendy-cv-wizard`) persists original content, structured entries, template, palette and paper. The older `LegacyEditor` and its separate database remain available in source, not in the wizard UI.

## Run and verify

Use Node 24 and pnpm 12.6.0 from repository root:

```
pnpm install --filter trendy-cv... --frozen-lockfile
pnpm --filter trendy-cv dev
pnpm --filter trendy-cv build
node --test apps/trendy-cv/ai-json.test.mjs apps/trendy-cv/review.test.mjs apps/trendy-cv/wizard.test.mjs apps/trendy-cv/resume-adapter.test.mjs apps/trendy-cv/template-layout.test.mjs
node apps/trendy-cv/smoke.cjs
```

Set `CHROME_BIN` for the browser test. Output: `apps/trendy-cv/dist`.

Browser coverage includes curation, empty sections, PDF text after edits, identical downloaded blob bytes, three templates with long content across pages, mobile width, structured draft restoration and A4/Letter selection. These checks do not replace visual inspection of page breaks.

For comparison artifacts, set `CV_ARTIFACT_DIR` to an existing directory before running `smoke.cjs`. It writes each template PDF and per-page PNG screenshots there. Run `node apps/trendy-cv/audit-pdfs.mjs <artifact-directory>` with Node 24 to check nonblank pages, all 45 fixture achievements appearing exactly once, and text positions within page boundaries. The long-content fixture produces two Onyx pages and three pages each for Azurill and Bronzor. This is a stress fixture, not a representative visual design sample.

## Remaining evaluation

- Compare rendered designs with user-selected examples before expanding the template gallery.
- Test required non-Latin scripts/fonts and diverse real CV layouts; current baseline uses Helvetica.
- Structured entry conversion is manual; automatic extraction into these entries is not implemented.
- Editing occurs in fields beside the PDF, not directly on PDF text.
- Typst/imprecv comparison is still a separate experiment; no Typst integration is included.
- Full-site CI/Netlify validation is required before publishing this source change.
