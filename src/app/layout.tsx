import type { Metadata } from "next"
import { Geist_Mono, Inter } from "next/font/google"
import { Toaster } from "sonner"

import "@/app/globals.css"
import "tldraw/tldraw.css"
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable
      )}
    >
      <body>
        {children}
        <Toaster richColors />
      </body>
    </html>
  )
}
