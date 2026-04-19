import type { Metadata } from "next"
import { Geist_Mono, Inter } from "next/font/google"
import { headers } from "next/headers"
import { Toaster } from "sonner"

import "@/app/globals.css"
import "tldraw/tldraw.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "H2 — PDF Canvas",
  description:
    "Drop a PDF onto a tldraw canvas. Pin and crop with custom tools.",
}

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Per-request nonce minted by middleware.ts. Threaded into next-themes so
  // its inline color-scheme boot script carries a valid nonce under the
  // strict-dynamic CSP.
  const nonce = (await headers()).get("x-nonce") ?? undefined

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable
      )}
    >
      <body>
        <ThemeProvider nonce={nonce}>{children}</ThemeProvider>
        <Toaster richColors />
      </body>
    </html>
  )
}
