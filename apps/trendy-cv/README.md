# Trendy CV

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
