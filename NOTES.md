# Decision notes

Per-task log of what I chose, what I rejected, and why. The [SPEC](./SPEC.md) has the full requirements; this file captures the trade-offs behind the implementation.

---

## Open questions resolved

The SPEC §9 flagged three ambiguities that needed an explicit call. The answers below are reflected in tests and video walkthrough.

1. **Orphan pins → not a state that needs resolving.** Pin membership is dynamic, not stored on the pin record (props are `Record<string, never>`). A pin with nothing under its tip is a valid decorative state — drop a shape under it later and it automatically rejoins a group on the next drag. The `registerAfterDeleteHandler` only cleans the bounds cache + drag-start snapshot; pin records themselves are never culled.
2. **Pin on 3+ overlapping shapes → attach all of them.** "Only the top two" is surprising when the user can see three shapes under the pin; "all" is the more useful default and the spec says 2+ as a minimum case, not a maximum.
3. **Crop region export → include PDF raster shapes.** The crop takes a screenshot; whatever's inside the rectangle goes in. Filtering PDF pages out of `getShapeIdsInsideBounds` would violate least-surprise.

---

## Task 2 — PDF display

**Image shapes vs. custom PDF shape.** Chose rasterized image shapes (pdfjs → `OffscreenCanvas` → `Blob` → tldraw asset). A live-rendering custom shape would give sharper zoom but multiplies per-frame render cost and complicates the crop/export pipeline — both `editor.toImage()` and `pdf-lib` happily ingest raster PNG, neither has a clean hook for a live pdfjs re-render. Trade-off accepted: on extreme zoom the raster softens. Could re-rasterize at higher DPR on large zoom deltas if it becomes visible.

**`OffscreenCanvas` + DPR cap.** Rasterization runs off the main thread via `OffscreenCanvas`, at `min(devicePixelRatio, 3)` pixel ratio. The cap exists because a 500-page deck on a 3× display would otherwise hold ~9 gigapixels of raster in `Blob` memory. 3× is high enough that pixel softening isn't noticeable at typical canvas zoom. No `<canvas>` fallback — SPEC targets latest Chrome/Safari/Firefox and all three have `OffscreenCanvas`.

**Virtualization.** Renders the first 10 pages up front; remaining pages lazy-load when they enter `editor.getViewportPageBounds()` (debounced 150 ms). Page-metadata layout (`extendLayout` / `extendLayoutToY`) is also lazy — opening a 500-page deck doesn't serialise 500 `pdf.getPage()` calls up front.

**Blob asset store.** `lib/tldraw/blob-asset-store.ts` is a custom `TLAssetStore` that stashes each uploaded `Blob` in a module-level `Map` keyed by asset id, returns `asset:<id>` as the stored `src` (one of tldraw's validator-approved protocols), and mints a lazy `URL.createObjectURL` on `resolve()`. The URL is cached so tldraw re-renders don't churn new blob URLs. A PDF page's PNG lives as a `Blob` + short URL string instead of a UTF-16 base64 data URL (~2.6× bloat) held in the asset record — cuts steady-state canvas memory ~60% for raster-heavy workloads. `dispose` on Canvas teardown frees the URLs.

**Error handling.** `PdfShapes` previously let pdf.js rejections escape as unhandled promise rejections. Wrapped `init()` in try/catch; errors surface via the `onError` prop back to `CanvasHost`, which flips to the existing `"error"` state and shows the friendly `PdfLoader` error UI.

**PDF pages are locked (`isLocked: true`).** Each page image is created with `isLocked: true` in `createPageShape`. Two effects: (1) users can't drag the backdrop out from under their annotations — the PDF acts as a fixed substrate; (2) tldraw's eraser and delete actions respect the lock, so pages can't be accidentally removed while cleaning up notes. Pin propagation is additionally decoupled from PDF pages by filtering them out of `findShapesUnderPinTip` — the lock is the UI-level defence, the filter is the semantic one.

---

## Task 2 — Export PDF

**`pdf-lib` + `editor.toImage()`-per-page vs alternatives.** Three options were considered:

1. **Overlay annotations onto the source PDF** (preserve text layer). Rejected for v1 — need to re-map page coordinates between tldraw space and PDF space, handle text vs. path vs. image shapes differently, and the result still wouldn't include the pin emoji without a raster fallback. More complex for no user-visible win on this exercise.
2. **Single `editor.toImage()` for the whole canvas, split into pages afterwards.** Loses per-page clipping — a stray shape in the gutter between pages 3 and 4 would appear on both output pages. Also forces the exporter to know page-break geometry twice (once for layout, once to crop).
3. **`editor.toImage()` per page, assembled with `pdf-lib`.** Chosen. Each call passes an explicit `shapeIds` list (collected via `getShapeIdsInsideBounds(pageBounds)` minus other PDF pages) plus `bounds: pageBounds` — so overlap in the gutter doesn't bleed neighbouring pages in. `pdf-lib` then `embedPng`s each result and `addPage`s it at the source page's dimensions. Raster round-trip means "what you see is what you get" matches the canvas pixel-for-pixel, including the pin emoji rendered via `toSvg()` override.

**Force-render before export.** Lazy-loaded pages (beyond the initial 10) may not be rasterized at export time. `PdfShapes` exposes `renderAll()` via an `onReady` callback; the export button awaits it before building the PDF and shows a spinner during the wait.

**Bounded concurrency (`EXPORT_CONCURRENCY = 2`).** `editor.toImage()` builds a scratch DOM for SVG rasterization per call. Unbounded `Promise.all` on a 100-page deck would blow scratch-DOM memory; fully sequential would be needlessly slow. 2 is enough to hide pdfjs worker latency without the memory cost. Results are collected in input order via `mapConcurrentOrdered`.

**Filename.** `<original>-annotated.pdf`. Preserves the source name so users recognise the export. Sample defaults to `sample-annotated.pdf`.

**Export button disabled while no PDF pages exist.** `export-pdf-button.tsx` reactively watches the current page for shapes with `meta[PDF_PAGE_META_KEY]` and disables the button when none are present. Before a PDF is loaded there's nothing to export; a disabled state gives honest UI feedback instead of a click-into-void followed by an empty-file toast. The button stays disabled through the initial-batch render too — shapes only land in the store once their page finishes rasterising, so the button enables the moment page 1 is in.

---

## Task 3 — Pin tool

**Pin icon: 📍 emoji, not lucide `MapPin`.** The shape and the toolbar button both render the emoji directly. tldraw's default icon pipeline renders toolbar icons via CSS `mask-image`, which strips the emoji's red/gold and falls back to a monochrome silhouette. The toolbar button is therefore a `TldrawUiButton` with text children rather than `TldrawUiMenuItem`. The emoji is platform-specific (Apple's pushpin differs from Microsoft's) but is recognisable as a pushpin everywhere, tracks OS font updates automatically, and needs zero SVG asset shipping. Exported via a `toSvg()` override emitting an SVG `<text>` node, so Export PDF and camera crop capture the pin correctly.

**Dynamic membership, no stored attached set.** Pin props are `Record<string, never>` — the shape carries no `attachedShapeIds`. Instead, `use-pin-attachment.ts` answers "who's under this pin's tip right now?" on every afterChange tick via `findShapesUnderPinTip`. Why: dropping a 3rd shape onto an existing pin joins the group automatically, with no prop-sync burden on shape create/delete/move. Trade-off: O(n) shape walk per change — fine at the 10–100-shape scale this exercise targets. A pin record with no shapes under its tip is a valid decorative state (see [Open questions](#open-questions-resolved)).

**Drag-start snapshot lock (MATT-146).** Inside a `select.translating` gesture, membership is frozen to a snapshot taken when the drag began (`preDragPinMembers: Map<PinId, Set<ShapeId>>`). Without the lock, a shape sliding INTO a pin zone mid-drag would be treated as an instant group member — the user would drag a new element across a pin and feel it get yanked into the group mid-motion. The workaround shipped in commit 4e52017's lineage is what lets the user release the new shape first and then pick it up again, now as part of the group. Outside the gesture (keyboard nudges, programmatic moves, undo/redo) membership is re-evaluated dynamically — single-tick updates don't have the mid-drag ambiguity. The distinction is one branch in the afterChange handler (`editor.isIn("select.translating")`).

**Side-effects over React effects.** Attachment propagation is wired via `editor.sideEffects.registerAfterChangeHandler('shape', ...)` inside a `useEffect`. `sideEffects` survive undo/redo cleanly, don't re-run on React render cycles, and run inside tldraw's atomic flush so the propagation is one history entry.

**Per-flush propagation guard (`propagatedIds` Set).** tldraw's `flushAtomicCallbacks` while-loop drains pending events across several iterations, so a plain boolean would be cleared between rounds and re-trigger the cascade. Tracking each propagated ID explicitly — and *not* sweeping the set after `editor.run(...)` returns — keeps the guard token alive for handlers that fire in a later flush iteration.

**Resize guard + bounds-fallback delta (`readTranslateDelta`).** Returns `null` when `props.w` or `props.h` changed, so top/left resize handles don't drag siblings along. When x/y are unchanged but bounds moved (arrow/line body drags leave `shape.x` alone — their geometry lives inside `props`), falls back to a prev/next `getShapePageBounds` delta so arrow drags still propagate to grouped siblings. A bounds cache (`lastBoundsByShape`) seeded on create + maintained on change keeps the prev-bounds lookup O(1).

**Gesture gating: only propagate under the select tool.** Drag-to-draw from a non-select tool (ellipse, rectangle, draw) updates `x`/`y` tick-by-tick as the user defines the shape without `w`/`h` changing; without a guard, `readTranslateDelta` would read that as a translate and drag an overlapping pin group along with the still-being-drawn shape. The handler early-returns unless `getCurrentToolId() === "select"`. Broader than `isIn("select.translating")` on purpose — keyboard nudges, undo/redo, and programmatic `updateShapes` all run under the select tool and must still propagate.

**Arrow double-move guard (`arrowBoundToSibling`).** tldraw's native arrow bindings already carry an arrow along when its bound target translates. If we also apply our delta to that arrow, it overshoots by 2×. The guard filters arrows out of the update batch when a `getBindingsFromShape` target is another sibling we're about to move in the same run.

**Attach all overlapping shapes.** `findShapesUnderPinTip` returns every non-pin, non-PDF shape whose bounds contain the pin's tip (expanded by `PIN_HIT_MARGIN = 6`). All of them become the group for the duration of the drag. See [Open questions](#open-questions-resolved).

**PDF pages are filtered out of the pin candidate list.** `isPdfPageShape` (type `image` with `meta[PDF_PAGE_META_KEY]`) is skipped inside `findShapesUnderPinTip` — otherwise every in-bounds pin drop would silently group with the backdrop and drag the page image around. The PDF pages' `isLocked: true` (see [Task 2 — PDF display](#task-2--pdf-display)) is a second line of defence at the tldraw UI level; this filter keeps the pin group semantically clean.

**Pins stay above newly-created shapes.** An `afterCreateHandler` calls `editor.bringToFront(pinIds)` whenever a non-pin shape is created. tldraw assigns each new shape an index above the current max, so a pin dropped before a later-drawn rectangle would otherwise end up visually behind it. The handler only mutates `index` — bounds/position are untouched, so the afterChange propagation path sees no translate delta and doesn't ripple the group. Freshly placed pins already sit on top (no-op branch).

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
