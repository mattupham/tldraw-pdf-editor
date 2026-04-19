/** @type {import('next').NextConfig} */

// CSP is set per-request in middleware.ts so we can mint a fresh nonce on
// every response. The headers here are request-independent and static —
// Next.js handles the request-level CSP; we just layer the stable ones on.
const securityHeaders = [
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
