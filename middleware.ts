import { type NextRequest, NextResponse } from "next/server"

// Per-request nonce + Content-Security-Policy.
//
// Why middleware and not next.config.mjs headers(): static headers can't carry
// a per-request secret. We need a fresh nonce on every request so inline
// scripts Next.js injects (RSC hydration pushes, next-themes' color-scheme
// init) can be whitelisted without 'unsafe-inline'.
//
// strict-dynamic is the trust-propagation directive: any script with a valid
// nonce can load further scripts without each one needing its own nonce.
// Combined with a fresh nonce per response, this makes script-src
// meaningfully restrictive.
//
// Constraint: nonced CSP and static prerendering don't mix — a build-time
// nonce in prerendered HTML won't match a request-time nonce. Our single
// page is marked `export const dynamic = "force-dynamic"` to opt into SSR
// so the nonce threading lines up.
export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID())

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    "'wasm-unsafe-eval'",
    process.env.NODE_ENV === "development" ? "'unsafe-eval'" : "",
  ]
    .filter(Boolean)
    .join(" ")

  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ")

  // Next.js reads x-nonce off the incoming request and attaches the nonce
  // to its own inline scripts automatically. We also echo it back on the
  // response so RSC page navigations pick up a new nonce from the header.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("content-security-policy", csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("content-security-policy", csp)
  return response
}

export const config = {
  matcher: [
    // Exclude static assets, fonts, and the pdfjs worker from middleware —
    // they don't need per-request CSP and running middleware on them is
    // wasted work. The `missing` clause skips prefetches so browsers don't
    // burn nonces on speculative loads that never render.
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|pdf.worker.min.mjs|sample.pdf).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}
