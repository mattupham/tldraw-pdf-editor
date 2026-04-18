# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **pnpm** (see `pnpm-lock.yaml`).

- `pnpm dev` — run the dev server (Next.js with Turbopack)
- `pnpm build` — production build
- `pnpm start` — serve the production build
- `pnpm lint` — ESLint (flat config, extends `eslint-config-next/core-web-vitals` + `/typescript`)
- `pnpm typecheck` — `tsc --noEmit` (no test suite is configured)
- `pnpm format` — Prettier write for `**/*.{ts,tsx}`

## Stack & architecture

This is a Next.js 16 App Router template wired to shadcn/ui. It is intentionally minimal — most of the "architecture" is the conventions baked into the tooling config, not custom code.

- **Next.js 16 + React 19**, App Router under `app/`. `app/layout.tsx` is the root layout and wraps everything in `ThemeProvider`. Dev uses Turbopack.
- **Tailwind CSS v4** via `@tailwindcss/postcss` (see `postcss.config.mjs`). There is **no `tailwind.config.*`** — theme tokens and `@theme` live in `app/globals.css`, which is also what `components.json` and the Prettier plugin point at.
- **shadcn/ui** is configured in `components.json`: style `radix-nova`, RSC on, RTL on, icon library `lucide`, base color `neutral`. Add new components with `npx shadcn@latest add <name>`; they land in `components/ui/`.
- **Radix primitives** are imported from the single `radix-ui` package (e.g. `import { Slot } from "radix-ui"`), not `@radix-ui/*` sub-packages. Follow this when adding components.
- **Path aliases** (from `tsconfig.json` + `components.json`): `@/*` → repo root. Canonical aliases are `@/components`, `@/components/ui`, `@/lib`, `@/lib/utils`, `@/hooks`.
- **Styling helper**: `cn()` in `lib/utils.ts` composes `clsx` + `tailwind-merge`. Variants use `class-variance-authority` (`cva`). Both `cn` and `cva` are registered as `tailwindFunctions` in `.prettierrc`, so class strings inside them get sorted by `prettier-plugin-tailwindcss`.
- **Theming**: `components/theme-provider.tsx` wraps `next-themes` (attribute=`class`, default=`system`) and installs a global hotkey — pressing `d` (outside of inputs/contenteditable) toggles light/dark.

## Code style

- Prettier: **no semicolons**, double quotes, 2-space tabs, `trailingComma: es5`, `printWidth: 80`, `endOfLine: lf`. Match existing files (e.g. `app/layout.tsx`, `components/ui/button.tsx`).
- TypeScript `strict` is on.
