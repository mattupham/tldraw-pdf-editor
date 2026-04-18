/** @type {import('next').NextConfig} */

// Content Security Policy. pdfjs uses a dedicated worker served from /public,
// tldraw applies inline styles from JS, and the worker does `wasm-unsafe-eval`
// in some pdfjs code-paths. 'unsafe-inline' on scripts is only required by
// Next.js in development (inline hydration scripts) — tightened for prod.
const scriptSrc = [
  "'self'",
  "'wasm-unsafe-eval'",
  process.env.NODE_ENV === "development" ? "'unsafe-inline' 'unsafe-eval'" : "",
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
