# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **pnpm** (see `pnpm-lock.yaml`).

- `pnpm dev` — run the dev server (Next.js with Turbopack)
- `pnpm build` — production build
- `pnpm start` — serve the production build
- `pnpm lint` — `biome lint .`
- `pnpm format` — `biome format --write .`
- `pnpm check` — `biome check --write .` (format + lint together)
- `pnpm typecheck` — `tsc --noEmit` (no test suite is configured)

## Stack & architecture

This is a Next.js 16 App Router template wired to shadcn/ui. It is intentionally minimal — most of the "architecture" is the conventions baked into the tooling config, not custom code.

- **Next.js 16 + React 19**, App Router under `src/app/`. `src/app/layout.tsx` is the root layout and wraps everything in `ThemeProvider`. Dev uses Turbopack.
- **Tailwind CSS v4** via `@tailwindcss/postcss` (see `postcss.config.mjs`). There is **no `tailwind.config.*`** — theme tokens and `@theme` live in `src/app/globals.css`, which is also what `components.json` points at.
- **shadcn/ui** is configured in `components.json`: style `radix-nova`, RSC on, RTL on, icon library `lucide`, base color `neutral`. Add new components with `pnpm dlx shadcn@latest add <name>`; they land in `src/components/ui/`. (The README shows `npx` and an old path — ignore it.)
- **Radix primitives** are imported from the single `radix-ui` package (e.g. `import { Slot } from "radix-ui"`), not `@radix-ui/*` sub-packages. Follow this when adding components.
- **Path aliases** (from `tsconfig.json` + `components.json`): `@/*` → `src/`. Canonical aliases are `@/components`, `@/components/ui`, `@/lib`, `@/lib/utils`, `@/hooks`.
- **Styling helper**: `cn()` in `src/lib/utils.ts` composes `clsx` + `tailwind-merge`. Variants use `class-variance-authority` (`cva`).
- **Theming**: `src/components/theme-provider.tsx` wraps `next-themes` (attribute=`class`, default=`system`). Dark mode is deferred per spec §6 — there's no visible toggle yet.

## Code style

- **Biome**: no semicolons, double quotes, 2-space indentation, `trailingCommas: es5`, `lineWidth: 80`, `lineEnding: lf`. Configured in `biome.json`.
- Biome has no Tailwind class sorter — sort classes manually when adding new ones.
- TypeScript `strict` is on, `noUncheckedIndexedAccess: true`.
- Pre-commit hook (husky + lint-staged) runs `biome check --write --no-errors-on-unmatched` on staged files (lint-staged handles file selection).
- **Absolute imports only**: all imports must use the `@/` alias (e.g. `@/tools/pin/pin-shape-util`). Relative paths (`./`, `../`) are forbidden and fail `pnpm check` — enforced by Biome's `style/noRestrictedImports` rule in `biome.json`.
