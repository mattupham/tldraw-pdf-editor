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
