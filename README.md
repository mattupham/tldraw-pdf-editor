# H2 Frontend

A tldraw-powered canvas that loads a PDF as its backdrop and exposes two custom tools:

- **Pin (📍)** — drop a pin on a cluster of overlapping shapes and the pin groups them, so dragging any member moves the whole set together.
- **Camera** — drag a rectangular crop and export it as a PNG screenshot.

Built for the H2 coding exercise. See [`SPEC.md`](./SPEC.md) for the full technical requirements and [`NOTES.md`](./NOTES.md) for per-task decision rationale.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript `strict` + `noUncheckedIndexedAccess`
- tldraw v3 — canvas, custom shapes, custom tools
- pdfjs-dist — PDF rasterization on an `OffscreenCanvas`
- pdf-lib — PDF export
- shadcn/ui + Tailwind v4 — chrome buttons, toasts
- Biome — format + lint (single tool)
- Vitest (unit) + Playwright (E2E)

## Getting started

Requires Node 23 (see `.nvmrc`) and pnpm.

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

## Scripts

| Command           | What it does                                        |
| ----------------- | --------------------------------------------------- |
| `pnpm dev`        | Next dev server with Turbopack                      |
| `pnpm build`      | Production build                                    |
| `pnpm start`      | Serve the production build                          |
| `pnpm check`      | `biome check --write .` — format + lint in one pass |
| `pnpm lint`       | Lint only                                           |
| `pnpm format`     | Format only                                         |
| `pnpm typecheck`  | `tsc --noEmit`                                      |
| `pnpm test`       | Vitest unit tests (pin attachment math, PDF helpers) |
| `pnpm test:e2e`   | Playwright integration tests (load PDF, pin drag, camera export) |

`postinstall` copies `pdfjs-dist`'s worker into `public/` so `GlobalWorkerOptions.workerSrc` can point at it.

## Project layout

```
src/
├── app/                  # Next.js App Router (root layout hosts the canvas)
├── components/
│   ├── canvas/           # Canvas host, PDF loader, export/camera buttons
│   └── ui/               # shadcn primitives
├── tools/
│   ├── pin/              # Pin tool — StateNode, ShapeUtil, attachment side-effects
│   └── camera/           # Camera tool — StateNode, crop overlay, export pipeline
└── lib/
    ├── pdf/              # pdf.js loader, page layout, OffscreenCanvas renderer, pdf-lib export
    └── utils.ts          # cn() helper
tests/e2e/                # Playwright specs (one per spec task)
```

## Design notes

Read [`NOTES.md`](./NOTES.md) for the full decision log — trade-offs considered, alternatives rejected, and how the three "open questions" from `SPEC.md` §9 were resolved (pin orphaning, multi-shape overlap, crop scope).
