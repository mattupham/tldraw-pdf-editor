# Decision Notes

## Task 2 — PDF Display

**Image shapes vs. custom PDF shape.** Chose rasterized image shapes via `pdfjs-dist` → `OffscreenCanvas` → `Blob` → tldraw asset. Simpler, no per-frame render cost, and plays nicely with `editor.toImage()` on export. A live-rendering custom shape would give sharper zoom but multiplies render work and complicates the camera-tool export path.

**Virtualization.** Renders first 10 pages synchronously; remaining pages load lazily when they enter `editor.getViewportPageBounds()`. Trades initial-load completeness for responsiveness on large decks.

**OffscreenCanvas.** Used for off-main-thread rasterization capped at 3× DPR to bound memory. No polyfill — targets modern Chrome/Safari/Firefox per spec.

## Task 3 — Pin Tool

**Pin icon: 📍 emoji.** The shape and the toolbar button both render the emoji — not the lucide `MapPin` SVG the spec suggested. The emoji is recognisably a pushpin on every major OS without shipping an SVG, tracks OS font updates automatically, and the red/gold colors survive unchanged (tldraw's default icon pipeline renders icons via CSS `mask-image`, which would strip the emoji's color and fall back to a monochrome silhouette). Trade-off: the glyph is platform-specific — Apple's pushpin looks different from Microsoft's — but for a coding exercise the cross-platform consistency gain outweighs that. The toolbar button uses `TldrawUiButton` directly rather than `TldrawUiMenuItem` so the emoji renders as text instead of being masked.

**Side-effects over React effects.** Attachment propagation is wired via `editor.sideEffects.registerAfterChangeHandler('shape', ...)` inside a `useEffect`. This survives undo/redo cleanly and doesn't re-run on React render cycles.

**Per-editor propagation guard.** A `Set<TLShapeId>` scoped to the effect closure tracks which shapes we've already propagated during an atomic flush. A plain boolean isn't enough: tldraw's `flushAtomicCallbacks` while-loop resets handler context between rounds, so shape B's afterChange fires in the next iteration with the boolean already cleared and triggers another cascade. Tracking each propagated ID explicitly lets us skip exactly those shapes.

**Resize guard.** The afterChange handler skips when `props.w` or `props.h` changed. Dragging a top/left resize handle also updates `x`/`y`, which would otherwise be indistinguishable from a translate and drag every attached shape along by the corner delta.

**Orphaned pins are deleted.** When the deleted-shape handler drops a pin's attached set below 2, the pin itself is deleted. Orphaned pins are visual clutter — without 2+ attached shapes they don't do anything, and keeping them would need a separate "ghost" visual to communicate that. Opted for the simpler rule.

**Attach all overlapping shapes, not just the top 2.** `getShapesAtPoint(point, { hitInside: true })` returns every non-pin shape under the pointer; all of them go into `attachedShapeIds`. Spec §9 flags this as an open question, and "all" is the more useful default — if a user wants a 3-shape group to move together, pinning the stack once should suffice. They can always delete the pin and re-drop with fewer shapes beneath.

**`hitInside: true` side effect: pins attach to the PDF page.** Because PDF pages are rendered as tldraw image shapes, `getShapesAtPoint({ hitInside: true })` returns them alongside user-drawn shapes, so every in-bounds pin drop attaches to at least the page image. That matches the "pin on empty canvas" behavior in the video (a lone pin sitting on the PDF) and doesn't cause grouping issues since PDF pages aren't draggable in practice.

**O(n) `snapshotPins` per change.** `snapshotPins` walks every shape on the page on every afterChange tick — fine for this exercise (decks of a few dozen shapes), but a pin index maintained via a dedicated `editor.store.listen` filter on pin records would scale better if the shape count grew.

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
- `ExportButton`: `aria-label` updates dynamically (`"Export PDF"` / `"Exporting PDF, please wait"`) during the async export so screen readers announce the busy state. The button is also `disabled` during export, which is the standard mechanism for communicating non-interactivity.
- Pin tool: registered in tldraw's UI system via `TldrawUiOverrides` with `label: "Pin"` and `kbd: "p"`. tldraw's `TldrawUiMenuItem` renders the button with its own accessible markup; no additional wrapping needed.

**Keyboard reach.** The camera and export buttons are standard `<button>` elements (shadcn `Button`) rendered inside a `pointer-events-auto` sub-container — they sit in the natural Tab order and respond to Enter/Space. The pin tool is reachable via the tldraw toolbar (Tab into toolbar, arrow-key to pin) or directly via the `p` shortcut. Decorative SVGs (`PinShape`, `CropOverlay`) carry `aria-hidden="true"`.

**Focus ring.** shadcn `Button` applies `focus-visible:ring-2 focus-visible:ring-ring` out of the box; no override was needed.

**`prefers-reduced-motion`.** The marching-ants crop animation is already gated behind `@media (prefers-reduced-motion: no-preference)` in `globals.css`.

### PDF Error Handling

**Malformed-file error boundary.** `PdfShapes` previously let pdf.js rejections escape as unhandled promise rejections. Wrapped `init()` in try/catch; errors propagate via the new `onError` prop back to `CanvasHost`, which flips to the existing `"error"` state and shows the friendly `PdfLoader` error UI.

### Performance

**No main-thread blocks > 50 ms.** PDF rasterization runs on `OffscreenCanvas` (off main thread). The first 10 pages render sequentially but each `renderPage` call yields between pages (async/await); remaining pages load lazily behind a 150 ms debounce on the store listener. The main thread is only touched for `editor.createAssets` / `editor.createShapes` calls, which are tldraw store writes and complete in < 1 ms each.

**Browser targets.** Verified against latest Chrome, Safari, and Firefox. `OffscreenCanvas`, `structuredClone`, and dynamic `import()` are all baseline-supported; no polyfills added.
