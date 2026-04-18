"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { useState } from "react"
import { PdfLoader } from "./pdf-loader"

type CanvasState =
  | { status: "empty" }
  | { status: "loading" }
  | { status: "loaded"; bytes: Uint8Array }

export function CanvasHost() {
  const [state, setState] = useState<CanvasState>({ status: "empty" })

  async function handleFile(file: File) {
    setState({ status: "loading" })
    try {
      const buf = await file.arrayBuffer()
      setState({ status: "loaded", bytes: new Uint8Array(buf) })
    } catch {
      setState({ status: "empty" })
    }
  }

  async function handleExample() {
    setState({ status: "loading" })
    try {
      const res = await fetch("/sample.pdf")
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
      const buf = await res.arrayBuffer()
      setState({ status: "loaded", bytes: new Uint8Array(buf) })
    } catch {
      setState({ status: "empty" })
    }
  }

  if (state.status === "empty") {
    return <PdfLoader onFile={handleFile} onExample={handleExample} />
  }

  if (state.status === "loading") {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="flex w-full max-w-sm flex-col gap-3 p-8">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="mt-4 h-64 w-full rounded-xl" />
        </div>
      </div>
    )
  }

  // loaded — Phase 3 will replace this placeholder with <Tldraw />
  return (
    <div
      className="flex min-h-svh items-center justify-center text-sm text-muted-foreground"
      data-testid="canvas-loaded"
    >
      PDF ready — {state.bytes.byteLength} bytes loaded
    </div>
  )
}
