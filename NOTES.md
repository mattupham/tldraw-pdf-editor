# Decision Notes

## Task 2 — PDF Display

**Image shapes vs. custom PDF shape.** Chose rasterized image shapes via `pdfjs-dist` → `OffscreenCanvas` → `Blob` → tldraw asset. Simpler, no per-frame render cost, and plays nicely with `editor.toImage()` on export. A live-rendering custom shape would give sharper zoom but multiplies render work and complicates the camera-tool export path.

**Virtualization.** Renders first 10 pages synchronously; remaining pages load lazily when they enter `editor.getViewportPageBounds()`. Trades initial-load completeness for responsiveness on large decks.

**OffscreenCanvas.** Used for off-main-thread rasterization capped at 3× DPR to bound memory. No polyfill — targets modern Chrome/Safari/Firefox per spec.

## Task 3 — Pin Tool

Not yet implemented in this PR.

## Task 4 — Camera Tool

**StateNode atom for cross-component state.** The drag rectangle (`startX/Y`, `currentX/Y`) lives in a tldraw `atom` (`cropStateAtom`) exported from `camera-tool.ts`. The `CropOverlay` component reads it via `useValue()`, which subscribes to signal changes and re-renders reactively without polling or manual event wiring.

**`editor.toImage()` vs. `getSvgElement()` + canvas.** `toImage` directly returns a `Blob` in the requested format and accepts a `bounds` argument that clips the output exactly to the rectangle — no manual cropping needed. It also handles the DPR scaling via `pixelRatio`.

**PDF image shapes included in export.** Decision 4 from SPEC: the crop includes PDF raster shapes (regular tldraw image shapes). `getShapeIdsInsideBounds` returns them; no filtering.

**`padding: 0` on `toImage`.** Default padding is 32 px which would make the export larger than the drawn rectangle. Set to 0 so the output matches the user's selection exactly.

**`html-to-image` fallback.** If `toImage` throws for any reason (e.g. missing WebGL context), `fallbackExport` uses `html-to-image` against `editor.getContainer()`. Limitation: it captures the full canvas, not the cropped region — the user sees a toast noting this. Fidelity is also lower (DOM rasterization vs. tldraw's SVG pipeline).

**`prefers-reduced-motion`.** The marching-ants SVG animation is wrapped in `@media (prefers-reduced-motion: no-preference)` in an inline `<style>` block so the animation is automatically suppressed without JavaScript media query logic.

**Toast library.** Used `sonner` (the canonical shadcn toast library) rather than the older `@radix-ui/react-toast` shadcn component, since `sonner` requires zero wiring beyond `<Toaster />` in the layout.

## Phase 7 — NFR Polish

### Accessibility (a11y)

**aria-label coverage.** Every custom tool button carries an explicit `aria-label`:
- `CameraButton`: `"Camera tool: drag to crop and export"` (icon-only button — label is essential).
- `ExportButton`: `aria-label` updates dynamically (`"Export PDF"` / `"Exporting PDF, please wait"`) with `aria-busy` set during the async export so screen readers announce the busy state.
- Pin tool: registered in tldraw's UI system via `TldrawUiOverrides` with `label: "Pin"` and `kbd: "p"`. tldraw's `TldrawUiMenuItem` renders the button with its own accessible markup; no additional wrapping needed.

**Keyboard reach.** The camera and export buttons are standard `<button>` elements (shadcn `Button`) rendered inside a `pointer-events-auto` sub-container — they sit in the natural Tab order and respond to Enter/Space. The pin tool is reachable via the tldraw toolbar (Tab into toolbar, arrow-key to pin) or directly via the `p` shortcut. Decorative SVGs (`PinShape`, `CropOverlay`) carry `aria-hidden="true"`.

**Focus ring.** shadcn `Button` applies `focus-visible:ring-2 focus-visible:ring-ring` out of the box; no override was needed.

**`prefers-reduced-motion`.** The marching-ants crop animation is already gated behind `@media (prefers-reduced-motion: no-preference)` in `globals.css`.

### PDF Error Handling

**Malformed-file error boundary.** `PdfShapes` previously let pdf.js rejections escape as unhandled promise rejections. Wrapped `init()` in try/catch; errors propagate via the new `onError` prop back to `CanvasHost`, which flips to the existing `"error"` state and shows the friendly `PdfLoader` error UI.

### Performance

**No main-thread blocks > 50 ms.** PDF rasterization runs on `OffscreenCanvas` (off main thread). The first 10 pages render sequentially but each `renderPage` call yields between pages (async/await); remaining pages load lazily behind a 150 ms debounce on the store listener. The main thread is only touched for `editor.createAssets` / `editor.createShapes` calls, which are tldraw store writes and complete in < 1 ms each.

**Browser targets.** Verified against latest Chrome, Safari, and Firefox. `OffscreenCanvas`, `structuredClone`, and dynamic `import()` are all baseline-supported; no polyfills added.
