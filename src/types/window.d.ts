import type { Editor } from "tldraw"

// Dev/E2E-only hook. Wired in canvas/editor.tsx behind NODE_ENV !== "production"
// || NEXT_PUBLIC_E2E === "1" — declared here so consumers (Playwright tests)
// can read it without a per-callsite @ts-expect-error.
declare global {
  interface Window {
    __editor?: Editor
  }
}
