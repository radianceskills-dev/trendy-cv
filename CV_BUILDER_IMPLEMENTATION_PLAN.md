# CV Builder Implementation Plan

Status: proposed implementation baseline following product discussion.
Scope: rebuild the guided CV workflow around fixed planned sections, repeatable typed entries, approved optimization and content-aware template selection.

## 1. Product decisions

1. At least one desired job/role and one industry are mandatory. Specific job titles and a job description are optional.
2. AI generates keywords and an ordered section plan using the approved registry.
3. Users populate planned sections manually or by pasting text for AI extraction.
4. Users can add, edit, remove and reorder entries inside sections. They cannot add sections or duplicate section instances.
5. Section plans become fixed once content entry begins. Empty planned sections remain editable but are excluded from preview, PDF and template eligibility counts.
6. Optimization uses the keyword plan and actual supplied content. Proposed changes require approval; final manual editing remains available.
7. Photo is optional, processed locally, and never needed by AI.
8. Template eligibility depends on content structure and measured fit, not section count alone.
9. Users choose a template, preview it, name the CV, save it locally and receive a PDF.
10. “Reassess section plan” is deferred in `FUTURE_IMPROVEMENTS.md` and must not appear in this release.

## 2. Architecture and current implementation gap

Current `apps/trendy-cv/src/Wizard.tsx` stores career sections largely as flat strings. The local `feat/cv-pdf-template-builder` branch adds manually structured experience/education and a shared PDF preview/download path using Reactive Resume. That is useful infrastructure, but Onyx, Azurill and Bronzor were rejected as product templates.

The separate local design study is `C:/dev/Tools-TR/cv-template-concepts/`. Five remaining families are Studio, Chronicle, Precision, Blueprint and Scholar, with photo/no-photo variants. Editorial was rejected and removed. The new three designs have not yet received final visual approval. Do not silently treat all five as approved for production.

Reuse browser-local AI transport, JSON repair, deadlines/cancellation, validation discipline and draft storage experience. Replace the flat-string CV model and the skills-only presentation optimizer. Do not add a processing backend.

Target data flow:

```text
Target -> Keyword + Section Plan -> Typed Section Draft
       -> Confirm Facts -> Reviewed Optimization -> Optional Photo
       -> Eligible Templates -> Exact PDF Preview -> Named Local Save + PDF
```

Separate modules:
- `section-registry`: approved types, title choices, field definitions, meaningful-content predicates.
- `cv-schema`: versioned target, plan, entry, draft and saved-record schemas.
- `ai-contracts`: plan, extraction and optimization prompts, validators and request boundaries.
- `section-editor`: registry-driven section forms and entry editors.
- `cv-storage`: IndexedDB draft, named CVs and local photo blobs.
- `template-registry`: supported section types, variants, layout capabilities and verified limits.
- `template-adapter`: CV data to rendering components, without changing factual content.
- `pdf-service` and `pdf-preview`: generation, fit diagnostics and shared preview/download bytes.

## 3. Data contract

### Identity header
Separate from sections: name, professional title, email, phone, location, optional links and optional local photo reference. It is not reorderable and does not count as a section.

### Target
`desiredJobs[]`, `industries[]`, optional `jobTitles[]`, optional `jobDescription`. Trim whitespace, reject whitespace-only required entries and deduplicate without losing display text. No target analysis request until both required lists contain at least one value.

### Keyword plan
Each keyword has a stable ID, phrase, category, priority and source (`jobDescription` or `targetInference`). Keep optional supporting source text for JD-derived terms. Model-generated inferences are labelled. Keywords are suggestions, not user qualifications.

### Section plan
Each planned section has a stable ID, approved type, approved initial title and brief rationale. Array order is authoritative. MVP permits at most one instance of each standard type; users cannot add instances. The reusable registry may support repeatable types later, but this workflow does not expose that capability. AI cannot invent a type or select `custom` in this release. Enforce the registry limit rather than an arbitrary unrelated section cap.

Source registry: the design study's `section-types.json` and `SECTION-TYPES.md`. Copy the agreed definition into the app's source-controlled registry; do not make runtime builds depend on an external local folder.

### Section instances and entries
`{ id, type, title, hidden, items[] }`. Hide empty sections by computed content presence; do not delete draft data. Default metadata, IDs, booleans and blank arrays do not count as meaningful content. Numeric zero can be meaningful. Do not create fictional organization labels to satisfy renderer schemas.

Each entry has a stable ID. Renderers must use IDs rather than array positions for editing identity. Type-specific fields are optional unless genuinely required to identify an entry. Validate length/count limits explicitly; never silently truncate accepted user content.

Dates preserve user precision: year, year-month or full date when relevant. Keep “current” separate from end date. Do not guess January 1 for a year-only date. Support an original date label when extraction cannot confidently normalize it, with a review flag.

| Type | Entry header | Content |
| --- | --- | --- |
| summary | None | One editable text block |
| experience | Company/workplace, role, dates, location | Description and repeatable achievement/responsibility bullets |
| education | Institution, qualification, subject, dates | Grade/honors, coursework, thesis, advisors, notes |
| skills | Group label | Repeatable skill items, optional description |
| certifications | Credential, issuer, issued/expires | ID, details, verification link |
| projects | Project, role, organization, dates | Description, contributions, outcomes, technologies, links |
| researchInterests | Optional group label | Text or research-area list |
| academicAppointments | Institution, department, role, dates | Description, research contributions, advisors |
| publications | Title, authors, venue, year, status | Citation fields, DOI, links; explicit published/under-review/in-preparation status |
| funding | Project, funder, role, dates, status | Total amount, allocated amount, currency, purpose |
| teaching | Course, institution, role, dates/terms | Level, enrollment, curriculum, contributions |
| mentoring | Person/group, supervision role, dates | Project, level, status, outcomes |
| presentations | Title, event, date, format | Authors, invited status, location, notes, links |
| service | Organization, role, dates | Category, activities, contributions |
| awards | Award, issuer, date | Details and links |

Section titles are fixed to the planned display titles in MVP. Changing content or templates does not change their meaning. The general schema retains title overrides for future use.

## 4. Screen flow and state transitions

### Step 1 — Your target
Jobs and industries are visibly required; titles/JD optional. Save locally as the user types. Continue triggers plan generation with loading, cancel and retry states.

### Step 2 — Your CV plan
Show keywords grouped by priority and the planned section list with short rationales. Continue accepts the plan and locks its structure for content entry. Retry is available before acceptance. After content entry begins, allow viewing the original target but do not silently regenerate its plan. Starting a differently targeted CV is a new draft; preserve the existing draft first.

### Step 3 — Add your information
Identity fields plus all planned section editors. Each repeatable section has an “Add experience/education/etc.” action rather than “Add section”. Empty section editors remain accessible.

Paste mode keeps the original text locally and explicitly discloses that it is sent to the selected provider. Send only the approved field schema and planned sections. Extract exactly what is supplied, without keyword optimization in this stage.

For a new empty draft, show extraction results before accepting them. For existing data, never overwrite silently: show a staged replacement for affected sections and require explicit acceptance. Repeated parse actions must not accumulate duplicate entries automatically.

No reassessment or unassigned-information UI in MVP. Preserve the complete original pasted text even when facts do not fit planned sections. State that extraction is limited to those sections; do not claim comprehensive capture. Map genuinely relevant facts into existing entry content, but do not shoehorn unrelated publications into employment.

### Step 4 — Check your facts
Review every populated section and edit entries. Offer remove/reorder entry actions and an undo for removal. Clearing all entries removes the section from final output, not from the editor. Add only entries, never sections. Confirmation establishes a versioned snapshot for optimization.

### Step 5 — Improve wording
Send target/keyword context and professional section data; exclude name, contact fields and photo. Minimize other identifying fields where unnecessary. Existing contact text inside free-text descriptions cannot be assumed automatically absent; disclosure must reflect actual request contents.

AI returns bounded, typed proposals referencing stable section/entry IDs and approved editable fields. Each proposal includes old-value snapshot, proposed value, rationale and keyword IDs. Preserve dates, organizations, qualifications, funding amounts and publication status unless the user explicitly corrects them. No whole-document replacement.

Show before/after per change, accept/dismiss controls and optional questions for missing support. Unsupported keywords stay suggestions and are not inserted as facts. Block stale patches after intervening edits. Do not delete entries or sections through an optimization patch. Final manual edits are authoritative and never automatically re-optimized. Allow skip/continue when AI fails; optimization should not trap a user with completed factual content.

### Step 6 — Photo
Upload JPEG/PNG/WebP, validate by decoding, offer crop/reposition and remove. Establish documented size/dimension limits, resize locally, re-encode into a stored blob and do not upload it. Do not accept arbitrary SVG/remote image URLs for the photo input. No photo is the default.

### Step 7 — Template and preview
Show only eligible photo/no-photo variants. Explain excluded templates in a compact optional message if useful. Render actual user content, not stock thumbnails alone. Theme/paper controls are secondary and must regenerate the same PDF used for export. Final edits remain reachable without losing selection.

### Step 8 — Save your CV
Save opens a name prompt. Require a nonblank name. A new save creates a stable record ID; an existing CV offers update or save as new. Duplicate names do not imply overwrite—identity is the record ID.

Persist the editable CV atomically, then generate/download the PDF with a safe filename derived from the CV name. Distinguish “Saved locally” from “PDF ready/download started”. If storage fails, show an explicit error and keep the draft; if PDF fails, keep the saved CV and offer export retry. Never imply a browser download was saved to disk when only initiated.

## 5. Template rendering strategy and fit

First complete a renderer proof before porting every design. Preferred starting point: native React-pdf components for approved custom layouts, retaining PDF.js preview of the exact blob. Existing schema adapters can inform implementation, but new templates should accept the canonical typed model without required fake company/school fields.

HTML prototypes are design references, not a second production layout engine. If the existing renderer cannot reproduce required typography or robust flow, assess a browser Typst implementation in the proof phase before committing to full migration. Do not introduce server-side Chromium or a document-processing service.

Template registry fields: family ID, photo support, supported section types, flow regions, tested section-count/content ranges, long-entry behavior, paper sizes and renderer version. Capability limits come from fixtures and rendered output, not guessed universal counts.

Eligibility sequence:
1. Compute nonempty section instances from canonical data.
2. Filter for photo variant and all required section types.
3. Apply tested structural limits and rough content estimates.
4. Render candidates, measure page count and detect known overflow/clipping conditions.
5. Offer valid candidates; never drop unsupported sections or shrink text below the agreed readability floor to force fit.

Provide at least one verified flowing multipage template for every supported type combination. If generation fails or no candidate fits, report it and preserve data rather than presenting a falsely valid template.

Rules: headings should stay with initial content; ordinary short entries should stay together where practical; oversized entries must be allowed to split; long publications and URLs must wrap; no empty sidebar reservation; no arbitrary two-page limit for academic CVs. Repeated identity/footer treatment is a template decision, not duplicated CV data.

The rejected Editorial/Onyx/Azurill/Bronzor choices must not be reintroduced as a production fallback without approval.

## 6. Local storage and recovery

Versioned IndexedDB records contain: schema version, stable CV ID, name, timestamps, target, keyword/section plan, typed entries, photo reference, template options and renderer version. Keep photo blobs in the same database with transactional updates. Store raw paste text and proposal history in the working draft; exclude them from the renderer payload.

Maintain one recoverable active draft plus a library of named CVs. Minimal library actions: open, update, save as new, export PDF, delete with confirmation. Browser-local storage is not cloud backup; present that plainly without adding unrelated account flows.

Migration:
- Read existing `trendy-cv-wizard` data without overwriting it.
- Preserve the pre-migration draft until the new record is successfully written.
- Map contact fields directly; retain flat career text as description content rather than inventing structure.
- Carry forward existing structured entries where validated and current.
- Missing mandatory target fields route the user to complete targeting; migration must not invent an AI plan.
- Preserve legacy data that has no current planned destination in the migration backup.
- Unsupported newer schema versions open with a clear recovery message; do not destructively downgrade.

## 7. AI reliability and privacy

Retain shared OpenRouter/Puter/Custom settings and HTTPS endpoint rules. Never embed credentials in CV records or exports. Use distinct plan/extract/optimize contracts, strict schema validation, bounded outputs, cancellation and deadlines. Reject explicit truncation and invalid section IDs/types. Local JSON repair may fix syntax only; repaired facts still require review.

Every request uses an input revision. Late responses after target/content edits or navigation cannot overwrite current data. Errors preserve user work and identify the failed step. Switching templates, cropping a photo, saving and exporting PDF require no AI request.

## 8. Implementation phases and completion gates

### Phase A — Canonical model
- Implement registry, runtime schemas, meaningful-content checks and stable entry IDs.
- Define adapters from legacy draft data with preserved originals.
- Gate: all 15 standard types represent their required content; duplicate/unknown plan types rejected; empty handling and migration tests pass.

### Phase B — Target and AI plan
- Required jobs/industries form; keyword and section planning; review/accept state.
- Gate: invalid targets never call AI; model output cannot add arbitrary types; retry/cancel/stale-response cases preserve state.

### Phase C — Section forms and extraction
- Shared form infrastructure plus type-specific fields; repeatable/reorderable entries; paste extraction staging.
- Gate: manual and parsed data converge to the same schema, original text preserved, no add-section controls, no silent overwrite or duplicate parse accumulation.

### Phase D — Reviewed optimization
- Replace existing flat-field reviewer with typed entry proposals grounded in keyword IDs and confirmed data.
- Gate: accept/dismiss/stale-patch coverage; no unsupported personal claims, contact/photo transmission or structural expansion.

### Phase E — Renderer proof and template port
- Select approved design with user, port one photo/no-photo family and one multipage academic fixture.
- Add actual-PDF preview, generation cancellation, URL cleanup and fit diagnostics.
- Gate: visual approval plus content preservation, page-break and text-extraction checks. Then port additional approved families using shared section renderers.

### Phase F — Photo and eligibility
- Local photo editing/storage; capability filter; measured fit and flowing fallback.
- Gate: only compatible variants offered; no missing nonempty sections, clipped long entries or stale downloadable PDFs.

### Phase G — Named CV library and export
- Name prompt, atomic save/update, draft restore, open/copy/delete and PDF download.
- Gate: storage quota failures and PDF failures handled independently; reopening restores content, photo and template; no accidental overwrite from duplicate names.

### Phase H — Integration and release
- Wire full wizard, update catalog/context docs, remove obsolete exposed behavior only after replacements pass.
- Run targeted unit/browser checks, full Trendy Tools assembly validation and production routing/CSP checks when publishing is authorized.
- Commit/push/PR/deploy only when requested. A local build does not establish production status.

## 9. Verification matrix

Fixtures: graduate résumé, mid-career professional, long employment history, sparse CV, academic publications/grants, unusually long title/organization/URL, date precision variants, many skill groups, and required non-Latin text once supported fonts are selected.

Check each approved template with/without photo and A4/Letter where supported:
- Every populated section and entry appears, in order, without unintended duplication.
- Empty sections and their headings are absent; clearing/restoring content behaves consistently.
- Same PDF bytes drive preview and download; edits disable stale export until regeneration.
- Text extraction retains names, headings, dates and final long-entry content.
- Page bounds, blank pages, font/glyph availability, heading orphans and entry splits are inspected.
- Responsive editor/preview and keyboard-accessible entry actions work.
- Browser reload restores the draft and named records.
- Mock-provider tests cover JSON repair, invalid plans, timeouts, cancellation and unsupported keywords.
- Real-provider quality is reviewed separately; mocked transport tests do not prove factual quality.
- Visual approval is explicitly human-reviewed if the active agent cannot inspect images.

## 10. Risks and mitigations

- Incomplete fixed plan: retain source paste text; defer reassessment as requested, and communicate extraction scope.
- Template count rules too crude: use type compatibility and measured fit, with an approved multipage fallback.
- Fact invention during optimization: bounded field patches, immutable factual fields, per-change approval.
- Header/content variation: type-aware renderers and optional fields, not a universal text blob.
- HTML/PDF mismatch: production preview renders the generated PDF, not separately styled HTML.
- Scope expansion: custom section creation, automatic plan reassessment, remote storage, DOCX, ATS scores and automatic job applications are outside this release.

## Recommended implementation start

Begin Phase A and Phase B, while confirming which local designs should be ported. Build one end-to-end vertical slice (target -> experience/education/skills -> reviewed edits -> approved template -> named save) before expanding to the remaining academic section editors. Do not claim the complete workflow finished until all planned types and the release gates are covered.
