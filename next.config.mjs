/** @type {import('next').NextConfig} */

// Content Security Policy.
// - pdfjs renders in a dedicated worker served same-origin from /public, and
//   its font/CMap loader takes a `wasm-unsafe-eval` code path.
// - tldraw applies inline styles from JS (style-src 'unsafe-inline').
// - Next.js ships inline bootstrap scripts — next-themes' color-scheme
//   initializer and the RSC hydration pushes — that run before React
//   hydration. Without nonces (which would require a `middleware.ts` that
//   injects a per-request nonce and threads it to the CSP + Next.js) we have
//   to allow 'unsafe-inline' on scripts. The rest of the policy (strict
//   default-src, frame-ancestors 'none', explicit worker-src, img-src) still
//   meaningfully narrows blast radius — this isn't a blanket opening.
// - Dev additionally needs 'unsafe-eval' for Turbopack HMR.
const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
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

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
]

const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
