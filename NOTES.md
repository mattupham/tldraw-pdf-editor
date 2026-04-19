# Decision notes

Per-task log of what I chose, what I rejected, and why. The [SPEC](./SPEC.md) has the full requirements; this file captures the trade-offs behind the implementation.

---

## Open questions resolved

The SPEC §9 flagged three ambiguities that needed an explicit call. The answers below are reflected in tests and video walkthrough.

1. **Orphan pins when the attached set drops below 2 → delete the pin.** Keeping them would need a "ghost" visual to communicate they've lost their grouping, which is extra surface for no functional gain. Implemented in `use-pin-attachment.ts` via the `registerAfterDeleteHandler` path.
2. **Pin on 3+ overlapping shapes → attach all of them.** "Only the top two" is surprising when the user can see three shapes under the pin; "all" is the more useful default and the spec says 2+ as a minimum case, not a maximum.
3. **Crop region export → include PDF raster shapes.** The crop takes a screenshot; whatever's inside the rectangle goes in. Filtering PDF pages out of `getShapeIdsInsideBounds` would violate least-surprise.

---

## Task 2 — PDF display

**Image shapes vs. custom PDF shape.** Chose rasterized image shapes (pdfjs → `OffscreenCanvas` → `Blob` → tldraw asset). A live-rendering custom shape would give sharper zoom but multiplies per-frame render cost and complicates the crop/export pipeline — both `editor.toImage()` and `pdf-lib` happily ingest raster PNG, neither has a clean hook for a live pdfjs re-render. Trade-off accepted: on extreme zoom the raster softens. Could re-rasterize at higher DPR on large zoom deltas if it becomes visible.

**`OffscreenCanvas` + DPR cap.** Rasterization runs off the main thread via `OffscreenCanvas`, at `min(devicePixelRatio, 3)` pixel ratio. The cap exists because a 500-page deck on a 3× display would otherwise hold ~9 gigapixels of raster in `Blob` memory. 3× is high enough that pixel softening isn't noticeable at typical canvas zoom. No `<canvas>` fallback — SPEC targets latest Chrome/Safari/Firefox and all three have `OffscreenCanvas`.

**Virtualization.** Renders the first 10 pages up front; remaining pages lazy-load when they enter `editor.getViewportPageBounds()` (debounced 150 ms). Page-metadata layout (`extendLayout` / `extendLayoutToY`) is also lazy — opening a 500-page deck doesn't serialise 500 `pdf.getPage()` calls up front.

**Blob asset store.** `lib/tldraw/blob-asset-store.ts` is a custom `TLAssetStore` that stashes each uploaded `Blob` in a module-level `Map` keyed by asset id, returns `asset:<id>` as the stored `src` (one of tldraw's validator-approved protocols), and mints a lazy `URL.createObjectURL` on `resolve()`. The URL is cached so tldraw re-renders don't churn new blob URLs. A PDF page's PNG lives as a `Blob` + short URL string instead of a UTF-16 base64 data URL (~2.6× bloat) held in the asset record — cuts steady-state canvas memory ~60% for raster-heavy workloads. `dispose` on Canvas teardown frees the URLs.

**Error handling.** `PdfShapes` previously let pdf.js rejections escape as unhandled promise rejections. Wrapped `init()` in try/catch; errors surface via the `onError` prop back to `CanvasHost`, which flips to the existing `"error"` state and shows the friendly `PdfLoader` error UI.

---

## Task 2 — Export PDF

**`pdf-lib` + `editor.toImage()`-per-page vs alternatives.** Three options were considered:

1. **Overlay annotations onto the source PDF** (preserve text layer). Rejected for v1 — need to re-map page coordinates between tldraw space and PDF space, handle text vs. path vs. image shapes differently, and the result still wouldn't include the pin emoji without a raster fallback. More complex for no user-visible win on this exercise.
2. **Single `editor.toImage()` for the whole canvas, split into pages afterwards.** Loses per-page clipping — a stray shape in the gutter between pages 3 and 4 would appear on both output pages. Also forces the exporter to know page-break geometry twice (once for layout, once to crop).
3. **`editor.toImage()` per page, assembled with `pdf-lib`.** Chosen. Each call passes an explicit `shapeIds` list (collected via `getShapeIdsInsideBounds(pageBounds)` minus other PDF pages) plus `bounds: pageBounds` — so overlap in the gutter doesn't bleed neighbouring pages in. `pdf-lib` then `embedPng`s each result and `addPage`s it at the source page's dimensions. Raster round-trip means "what you see is what you get" matches the canvas pixel-for-pixel, including the pin emoji rendered via `toSvg()` override.

**Force-render before export.** Lazy-loaded pages (beyond the initial 10) may not be rasterized at export time. `PdfShapes` exposes `renderAll()` via an `onReady` callback; the export button awaits it before building the PDF and shows a spinner during the wait.

**Bounded concurrency (`EXPORT_CONCURRENCY = 2`).** `editor.toImage()` builds a scratch DOM for SVG rasterization per call. Unbounded `Promise.all` on a 100-page deck would blow scratch-DOM memory; fully sequential would be needlessly slow. 2 is enough to hide pdfjs worker latency without the memory cost. Results are collected in input order via `mapConcurrentOrdered`.

**Filename.** `<original>-annotated.pdf`. Preserves the source name so users recognise the export. Sample defaults to `sample-annotated.pdf`.

---

## Task 3 — Pin tool

**Pin icon: 📍 emoji, not lucide `MapPin`.** The shape and the toolbar button both render the emoji directly. tldraw's default icon pipeline renders toolbar icons via CSS `mask-image`, which strips the emoji's red/gold and falls back to a monochrome silhouette. The toolbar button is therefore a `TldrawUiButton` with text children rather than `TldrawUiMenuItem`. The emoji is platform-specific (Apple's pushpin differs from Microsoft's) but is recognisable as a pushpin everywhere, tracks OS font updates automatically, and needs zero SVG asset shipping. Exported via a `toSvg()` override emitting an SVG `<text>` node, so Export PDF and camera crop capture the pin correctly.

**Side-effects over React effects.** Attachment propagation is wired via `editor.sideEffects.registerAfterChangeHandler('shape', ...)` inside a `useEffect`. `sideEffects` survive undo/redo cleanly, don't re-run on React render cycles, and run inside tldraw's atomic flush so the propagation is one history entry.

**Per-editor propagation guard.** A `Set<TLShapeId>` scoped to the effect closure tracks which shapes we've already propagated during an atomic flush. A plain boolean isn't enough: tldraw's `flushAtomicCallbacks` while-loop resets handler context between rounds, so shape B's afterChange fires in the next iteration with the boolean already cleared and triggers another cascade. Tracking each propagated ID explicitly lets us skip exactly those shapes.

**Resize guard.** The afterChange handler skips propagation when `props.w` or `props.h` changed. Dragging a top/left resize handle also updates `x`/`y`, and without the guard it would be indistinguishable from a translate — the corner delta would drag every attached shape along.

**Attach all overlapping shapes.** `getShapesAtPoint(point, { hitInside: true })` returns every non-pin shape under the pointer; all of them go into `attachedShapeIds`. See [Open questions](#open-questions-resolved).

**`hitInside: true` side-effect: pins attach to the PDF page.** Because PDF pages are rendered as tldraw image shapes, `getShapesAtPoint({ hitInside: true })` returns them alongside user-drawn shapes — so every in-bounds pin drop attaches to at least the page image. Matches the "pin on empty canvas" behaviour shown in the spec video (a lone pin sitting on the PDF) and doesn't cause drag issues since PDF pages aren't draggable in practice (they're locked and filter out of the afterChange drag path).

**Orphaned pins deleted via `registerAfterDeleteHandler`.** When an attached shape is deleted, the handler walks every pin whose `attachedShapeIds` contains that ID, removes it, and deletes any pin whose set drops below 2. See [Open questions](#open-questions-resolved).

**`snapshotPins` is O(n) per change.** Walks every shape on the page on every afterChange tick — fine for decks of a few dozen shapes. A pin index via `editor.store.listen` filtered to pin records would scale better if this grew; not worth the complexity at current scale.

---

## Task 4 — Camera tool

**Toolbar placement.** Registered alongside the pin tool via `overrides.tools`, keyboard shortcut `c`. Renders through `TldrawUiButton` with a lucide `Camera` icon child — same reason as the pin button (tldraw's default icon mask strips color). An earlier iteration used a standalone shadcn button top-right; moving it into the toolbar matches the spec and keeps both custom tools discoverable in the same place.

**StateNode atom for cross-component state.** The drag rectangle (`startX/Y`, `currentX/Y`) lives in a tldraw `atom` (`cropStateAtom`) exported from `camera-tool.ts`. `CropOverlay` reads it via `useValue()`, which subscribes to signal changes and re-renders reactively without polling or manual event wiring.

**`editor.toImage()` vs. `getSvgElement()` + manual canvas.** `toImage` returns a `Blob` in the requested format directly and accepts a `bounds` argument that clips output exactly to the rectangle — no manual cropping. It also handles DPR via `pixelRatio`. Manual `getSvgElement` + `OffscreenCanvas` would duplicate tldraw's own rasterization path.

**`padding: 0`.** `toImage`'s default padding is 32 px, which would make the export larger than the drawn rectangle. Zeroed so the output matches the user's selection exactly.

**PDF raster shapes included.** See [Open questions](#open-questions-resolved).

**`html-to-image` fallback.** If `toImage` throws for any reason (e.g. missing WebGL context), `fallbackExport` uses `html-to-image` against `editor.getContainer()`. Limitation: captures the full canvas, not the cropped region — user sees a toast noting that. Fidelity is also lower (DOM rasterization vs. tldraw's SVG pipeline). Kept because it turns a hard failure into a degraded-but-useful screenshot.

**`sonner` for toasts.** Canonical shadcn toast library; zero wiring beyond `<Toaster />` in the layout. Older `@radix-ui/react-toast` shadcn component was the alternative — more imperative, more boilerplate.

---

## Accessibility

**aria-labels on every custom control.** Pin and Camera toolbar buttons are icon-only, so both are registered with explicit `label` + `kbd` (`"p"` / `"c"`) — tldraw's toolbar API wires these through to `aria-label` + tooltip + shortcut binding in one step. Decorative SVGs (`PinShape`, `CropOverlay` marching-ants) carry `aria-hidden="true"`.

**Keyboard reach.** Both tools are reachable via Tab into the tldraw toolbar + arrow-key between items, or directly via the single-key shortcut. No custom focus trap — tldraw's toolbar handles it.

**Focus ring.** `TldrawUiButton` inherits tldraw's native focus styling; no override.

**`prefers-reduced-motion`.** `globals.css` has a global `@media (prefers-reduced-motion: reduce)` block that neutralises every animation + transition duration — covers the camera's marching-ants, the shadcn skeleton pulse, and any future `animate-*` utility without a per-component opt-in. The marching-ants animation is additionally wrapped in `@media (prefers-reduced-motion: no-preference)` inline so it's inert on first paint instead of fading out after a reset.

---

## Performance

**Main-thread budget.** pdfjs rasterization runs on `OffscreenCanvas` off the main thread. The main thread is only touched for `editor.createAssets` / `editor.createShapes` calls (tldraw store writes, <1 ms each). First 10 pages render with a concurrency cap of 4; remaining pages load lazily behind a 150 ms debounce on the store listener. Measured ad-hoc via DevTools; not asserted in CI.

**Lazy layout.** `extendLayout` / `extendLayoutToY` only call `pdf.getPage()` for pages either in the initial batch or visible in the current viewport. Opening a 500-page deck doesn't serialise 500 metadata fetches up front.

**Blob asset store memory win.** See Task 2 — PDF display. Cuts steady-state canvas memory ~60% for raster-heavy workloads vs. base64 data URLs.

**Export concurrency cap.** `EXPORT_CONCURRENCY = 2` for `editor.toImage()` calls during PDF export — see Task 2 — Export PDF.

**Browser targets.** Latest Chrome, Safari, Firefox. `OffscreenCanvas`, `structuredClone`, dynamic `import()` are all baseline-supported — no polyfills added.

---

## Security

**CSP with a per-request nonce.** `middleware.ts` mints a fresh UUID-based nonce on every request and sets the full Content-Security-Policy (`default-src 'self'`, `script-src 'self' 'nonce-<fresh>' 'strict-dynamic' 'wasm-unsafe-eval'`, `style-src 'self' 'unsafe-inline'`, `worker-src 'self' blob:`, `object-src 'none'`, `frame-ancestors 'none'`). Next.js threads the nonce onto every inline script it emits once `x-nonce` is on the request headers; `next-themes` picks up the same nonce via its `nonce` prop (passed from `layout.tsx` via async `headers()`). `strict-dynamic` means any script with a valid nonce can transitively load further scripts — enough for Next's bootstrap pipeline without granting blanket `'unsafe-inline'`. `next.config.mjs` still owns the request-independent headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`).

**Trade-off:** `export const dynamic = "force-dynamic"` on `app/page.tsx`. A build-time prerender would bake a stale nonce that wouldn't match the request-time CSP. The page is a thin canvas host — it has no cacheable content anyway.

**pdfjs hardening.** `getDocument` is called with `isEvalSupported: false`, `disableAutoFetch: true`, `disableStream: true` — closes the font-eval CVE class and disables speculative range fetches we don't need (bytes are already in memory).

**E2E hook is gated.** `window.__editor` only mounts when `process.env.NODE_ENV !== "production"` or `NEXT_PUBLIC_E2E === "1"`. CI sets the env at the job level so the prod bundle Playwright serves carries the hook; real production builds do not.

**Blob URL discipline.** `disposeBlobAssets()` is called from the Canvas `useEffect` cleanup so teardown revokes every URL the asset store minted. Prevents a navigation-driven leak where old decks' blob URLs would stay resident.

---

## Testing strategy

**Unit tests (Vitest).**
- `pin-attachment.test.ts` — attachment math + propagation semantics on a real `Editor` instance.
- `pin-overlap.test.ts` — `getShapesAtPoint` filtering (non-pin + dedupe).
- `lib/pdf/export.test.ts` — page-shape collection, filename helper, `mapConcurrentOrdered` preserves order.
- `lib/pdf/render.test.ts` — DPR cap logic.

**E2E tests (Playwright).** One spec per SPEC task, plus targeted regression specs:
- `pin-attach.spec.ts` — place pin, drag one member, assert the other members moved by the same delta.
- `pin-bindings.spec.ts` — undo/redo a pin drop round-trips the attached set correctly.
- `pin-pdf-guard.spec.ts` — PDF page doesn't drag when a pin above it is dragged (membership filter).
- `export-pdf.spec.ts` — click Export PDF, assert a download lands with the annotated filename.
- (+ Task 2 / Task 4 coverage in the existing smoke specs.)

Tests boot the app with `NEXT_PUBLIC_E2E=1` so they can read `window.__editor` and drive the store directly for assertions.

---

## Developer ergonomics

- **Biome** as the single format + lint tool (`pnpm check` = `biome check --write .`). Config in `biome.json`. ~10× faster than Prettier + ESLint.
- **`biome.json` `style/noRestrictedImports`** forbids relative paths (`./`, `../`) — all imports must use the `@/*` alias. Enforced on CI; relative imports fail `pnpm check`.
- **TypeScript `strict: true` + `noUncheckedIndexedAccess: true`.** The latter is noisy but catches real `undefined` slips in array access — load-bearing for the PDF page shape collector (`pages[i]` after sort).
- **husky + lint-staged** pre-commit: `biome check --write --no-errors-on-unmatched --staged`. Only touches staged files, no full-tree scan on every commit.
- **pnpm** (not npm) — lockfile is `pnpm-lock.yaml`; `postinstall` copies the pdfjs worker into `public/`.
