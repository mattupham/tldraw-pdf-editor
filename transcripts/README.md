# AI transcripts

Raw Claude Code session logs from the phases that built this project. Committed because the [H2 README explicitly asks for them](../SPEC.md#8-submission-hygiene).

## Format

Each file is a [JSONL](https://jsonlines.org/) stream of Claude Code messages — one JSON object per line. Fields of interest:

- `role` — `"user"` or `"assistant"`
- `content` — the prompt or response (may be a string or an array of content blocks for tool calls / tool results)
- `timestamp` — wall-clock time

Tool calls (`Read`, `Edit`, `Bash`, `Grep`, etc.) and their results are inlined as content blocks — the full back-and-forth is preserved, not just the summarised diffs.

## What's here

One subdirectory per Linear ticket. Each directory contains every session started against that worktree, newest last. Where a phase spanned multiple sessions (e.g. phase 6 has 3 files), the earlier sessions usually contain the initial build and the later ones contain review-driven fixes.

| Directory | Ticket | Scope |
| --- | --- | --- |
| `phase-0-repo-alignment/` | [MATT-128](https://linear.app/mattupham/issue/MATT-128) | pnpm + Biome + husky + `src/` layout |
| `phase-1-tldraw-baseline/` | [MATT-129](https://linear.app/mattupham/issue/MATT-129) | `<Tldraw />` mount + canvas host |
| `phase-2-pdf-loader/` | [MATT-130](https://linear.app/mattupham/issue/MATT-130) | Entry screen (Open PDF / Use example) |
| `phase-3-pdf-render/` | [MATT-131](https://linear.app/mattupham/issue/MATT-131) | pdfjs → `OffscreenCanvas` → tldraw image shapes |
| `phase-4-export-pdf/` | [MATT-132](https://linear.app/mattupham/issue/MATT-132) | `editor.toImage()` per page → `pdf-lib` assembly |
| `phase-5-pin-tool/` | [MATT-133](https://linear.app/mattupham/issue/MATT-133) | Pin shape + toolbar + `sideEffects` attachment |
| `phase-6-camera-tool/` | [MATT-134](https://linear.app/mattupham/issue/MATT-134) | Crop marquee + `editor.toImage()` export |
| `phase-7-nfr-polish/` | [MATT-135](https://linear.app/mattupham/issue/MATT-135) | a11y, perf, CSP nonce, error boundaries |
| `phase-8-tests/` | [MATT-136](https://linear.app/mattupham/issue/MATT-136) | Vitest unit + Playwright E2E |
| `matt-142-absolute-imports/` | [MATT-142](https://linear.app/mattupham/issue/MATT-142) | Biome `noRestrictedImports` rule |

## What's *not* here

- The in-progress session for Phase 9 itself (MATT-137) — its JSONL is still being written to at commit time.
- Ad-hoc exploratory sessions (spike on a pin bug, standalone `/review` runs, initial `/init`) — not tied to a ticket.
- `MATT-143` (review polish) and `MATT-144` (Export PDF polish + magnetic pin) — those spanned multiple worktrees and chat sessions and the logs aren't cleanly attributable to one run.

## How to read them

Opening a JSONL directly in an editor works but is dense. A quick filter to see only user prompts:

```bash
jq -r 'select(.role == "user") | .content | if type == "string" then . else (. | tostring) end' phase-5-pin-tool/*.jsonl | head -50
```

…or with `fx` / `jless` for interactive browsing.
