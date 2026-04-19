import { CanvasHost } from "@/components/canvas/canvas-host"

// Opt out of static prerendering so middleware's per-request nonce threads
// through the rendered HTML. A build-time prerender would bake a stale nonce
// that can't match the request-time CSP header.
export const dynamic = "force-dynamic"

export default function Page() {
  return <CanvasHost />
}
