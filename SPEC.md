# Technical Requirements Document: H2 Frontend Coding Exercise

## 1. Project Overview

An imaginary web app built around a **tldraw**-powered canvas where users can open a PDF, drop it onto the canvas as the backdrop, and interact with it via custom tools (pin, camera). The PDF is the substrate for all user interactions.

**Stack:** Next.js (App Router) + TypeScript + shadcn/ui + tldraw v3 + pdf.js.

---

## 2. Repository Setup (Task 1)

**Package manager:** pnpm — fast, disk-efficient, strict dependency resolution. Signals modern taste over the npm default.

**Code formatting & linting:**

- **Biome** (single tool for both format + lint) with a committed `biome.json`. One binary, one config, ~10× faster than Prettier + ESLint — no plugin-resolution drift between teammates.
- Scripts: `pnpm format` (`biome format --write .`), `pnpm lint` (`biome lint .`), `pnpm check` (`biome check --write .` — runs both).
- `lint-staged` + `husky` pre-commit hook running `biome check --write --no-errors-on-unmatched --staged` on staged files only.
- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`.
- **Tradeoff note:** Biome's Next.js/React rule coverage is narrower than `eslint-config-next`. If a Next-specific rule becomes load-bearing (e.g. `no-html-link-for-pages`), add ESLint back as a second pass rather than fighting Biome.

**Folder structure (opinionated, colocation-first):**

```
src/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx
│   └── page.tsx            # Hosts the canvas
├── components/
│   ├── ui/                 # shadcn/ui primitives
│   └── canvas/             # Canvas-specific components
│       ├── editor.tsx      # tldraw <Tldraw /> wrapper
│       ├── pdf-loader.tsx  # "Open PDF / Use an example" screen
│       └── export-button.tsx
├── tools/                  # Custom tldraw tools (one folder per tool)
│   ├── pin/
│   │   ├── pin-tool.ts           # StateNode subclass
│   │   ├── pin-shape-util.ts     # ShapeUtil subclass
│   │   ├── pin-shape.tsx         # React component for the shape
│   │   └── use-pin-attachment.ts # Side-effects hook for group-move
│   └── camera/
│       ├── camera-tool.ts
│       ├── crop-overlay.tsx
│       └── export-image.ts
├── lib/
│   ├── pdf/                # pdf.js worker, rendering helpers
│   └── utils.ts            # cn() helper for shadcn
└── styles/
    └── globals.css
```

**Also committed:** `.gitignore` (Next.js + OS + IDE), `README.md` with run instructions, `.env.example`, `.nvmrc`.

---

## 3. Task 2 — PDF Display

**Entry state.** A centered card with two buttons, **Open PDF** and **Use an example** — shadcn `Button`s, no tldraw rendered yet.

**After a PDF is loaded:**

- The tldraw canvas mounts full-viewport.
- Each PDF page is rendered as a **tldraw image shape** (not an HTML overlay), stacked vertically with a small gutter, centered horizontally in page space.
- tldraw's `camera` zooms to fit the first page on initial load.
- An **Export PDF** button (shadcn, primary blue) is pinned top-right via tldraw's `components.TopPanel` override or a simple absolute-positioned overlay outside the `<Tldraw />` container.

**Rendering pipeline (performance is the grading criterion):**

1. Load PDF bytes via `pdfjs-dist` (web worker — ship the worker via Next.js `public/` and point `GlobalWorkerOptions.workerSrc` at it).
2. For each page, render to an `OffscreenCanvas` at a **device-pixel-ratio-aware resolution** (2× or the user's DPR, capped at 3× to bound memory).
3. Convert to a `Blob` → upload as a tldraw asset via `editor.createAssets([...])`.
4. Create an `image` shape per page referencing that asset.
5. Virtualize: for decks larger than ~10 pages, render only the first N pages synchronously; lazily render the rest as they enter the camera viewport (watch `editor.getViewportPageBounds()` via a debounced listener).

**Tradeoffs to call out in the decision notes:**

- **Image shapes vs custom PDF shape.** Image is simpler, rasterized once, and plays nicely with tldraw's export. A custom shape rendering live via pdf.js gives sharper zoom but complicates export and multiplies render work. **Choose image shapes**; re-rasterize on large zoom deltas if needed.
- **Resolution cap** prevents OOM on huge documents.
- **OffscreenCanvas** keeps rendering off the main thread.

**Export PDF** uses `pdf-lib` to write the rendered images back into a PDF (one page per image). Simplest correct answer; an alternative is `editor.toImage()` per page then assemble — mention as a considered option.

---

## 4. Task 3 — Pin Tool

**Toolbar.** The custom pin tool is added to tldraw's toolbar. In the video it appears as a leftmost placeholder icon — replace with a proper pin icon (lucide's `MapPin` or `Pin`). Use tldraw v3's `overrides.tools` + `components.Toolbar` API.

**The pin shape:**

- Extend `ShapeUtil<TLPinShape>` with a custom shape type `"pin"`.
- Visually: a red pushpin SVG (≈24×32 px, anchored at the pin's tip). Not resizable, not rotatable, aspect-locked.
- `canEdit: false`, `hideResizeHandles: true`, `isAspectRatioLocked: true`.
- `getGeometry` returns a small rectangle around the pin head for hit-testing.

**Behavior on click (the tool's `StateNode`):**

1. On `pointer_down` in the `pin` tool, read `editor.getShapesAtPoint(currentPagePoint)`.
2. Filter out pins (so we don't attach pins to pins).
3. Create the pin shape at the pointer location.
4. If **2 or more shapes** overlap at that point, record their IDs as the pin's "attached set" (`props.attachedShapeIds: string[]`).
5. Return to the select tool after creation (standard tldraw tool UX).

**Attachment behavior (the tricky part):**

- Use `editor.sideEffects.registerAfterChangeHandler('shape', ...)` on **non-pin** shapes.
- When a shape's `x` or `y` changes (user dragged it):
  - Find every pin whose `attachedShapeIds` contains this shape's ID.
  - For each such pin, compute the delta and apply it to every **other** shape in the attached set (and to the pin itself, so the pin stays visually on top of the shape).
  - Use a module-level `isPropagating` flag to prevent infinite recursion.
- Batch updates in a single `editor.batch(() => { ... })` so undo treats the group move as one entry.

**Edge cases:**

- Deleting an attached shape → remove its ID from every pin's attached set; if the set drops below 2, delete the pin (or leave it orphaned — pick one, document the choice).
- Pin placed on empty canvas or on 1 shape → still creates the pin but with an empty/single-item attached set (no grouping effect). Matches what the video shows (stray pin sitting on the canvas).
- Overlapping attached sets (pin A attaches {X,Y}, pin B attaches {Y,Z}) → when Y moves, X, Y, Z all move. The `afterChange` handler re-runs naturally; the recursion guard prevents loops.

**Why `sideEffects` over a React effect:** tldraw-native, survives undo/redo cleanly, doesn't re-run on every render.

---

## 5. Task 4 — Camera Tool

**Toolbar.** Camera icon (lucide's `Camera`) replacing the placeholder slot.

**Interaction (two-phase):**

**Phase 1 — Crop selection:**

1. Click camera tool → cursor becomes crosshair.
2. Drag to draw a rectangular marquee in page space (store `x0, y0` on `pointer_down`; update `x1, y1` on `pointer_move`).
3. Render the marquee live as an overlay (tldraw's `components.InFrontOfTheCanvas` or a custom shape in a `brush` subtype).
4. On `pointer_up`, if the rectangle has meaningful area (> ~8×8 px), commit; else cancel back to select tool.

**Phase 2 — Export:**

- Use `editor.toImage(shapeIdsInBounds, { bounds: croppedBounds, format: 'png', background: true, scale: devicePixelRatio })`. tldraw v3 exposes `toImage` which returns `{ blob, width, height }`.
- Pass `bounds` explicitly rather than selecting shapes, so the output is cropped exactly to the rectangle regardless of which shapes partially intersect it.
- Trigger a download: `URL.createObjectURL(blob)` → `<a download="screenshot.png" href=...>` → `click()` → revoke.
- Optional polish: shadcn `Toast` ("Exported screenshot.png") on success.

**Fallback:** if `OffscreenCanvas` is missing or `toImage` fails, fall back to `html-to-image` against the canvas container. Document this.

---

## 6. Shared UI / Chrome

- Right-side style panel: stock tldraw, unchanged.
- Bottom toolbar: stock tldraw with two tools added (pin, camera).
- Top-left hamburger + page menu: stock tldraw.
- Top-right: **Export PDF** button (Task 2) — only visible when a PDF is loaded.
- Loading & empty states use shadcn `Skeleton` and `Button` variants.
- Dark mode: deferred; not shown in videos.

---

## 7. Non-Functional Requirements

- **Performance budget.** Initial PDF render of a 10-page doc under 1.5s on an M-series Mac; no main-thread blocks > 50ms.
- **Accessibility.** Tool buttons are keyboard-focusable with `aria-label`s; respect `prefers-reduced-motion` for the crop marquee animation.
- **Browser targets.** Latest Chrome, Safari, Firefox. No IE, no polyfills for `OffscreenCanvas`.
- **Testing.** One integration test per task with Playwright (load PDF; place pin and drag attached shapes; crop-and-export and assert download). Unit tests on `pin-shape-util` attachment math and the PDF rendering helpers.

---

## 8. Submission Hygiene

- `.gitignore` covers `node_modules`, `.next`, `.env.local`, `.DS_Store`.
- `NOTES.md` with per-task decision log: **what I chose, what I rejected, why.** This is what the README explicitly rewards ("we want to see your decisions, thoughts").
- A short walkthrough video (Loom or QuickTime) — the README calls this out as appreciated.
- Include AI session transcripts if used — the README says so literally.

---

## Open questions to flag in the submission

1. **Pin orphaning.** Delete orphaned pins when their attached set drops below 2, or keep them as decoration? (Video is ambiguous.)
2. **Pin on 3+ overlapping shapes.** Attach all of them, or only the top two? Default to **all** — more useful, and the README says "2 overlapping shapes" as the minimum case, not the maximum.
3. **Crop region export.** Include PDF image shapes in the crop, or only tldraw-native shapes? Include everything in bounds — it's what users expect when they "take a screenshot".
