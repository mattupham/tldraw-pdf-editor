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

  function handleFile(bytes: Uint8Array) {
    setState({ status: "loading" })
    // Yield to paint the skeleton before the (potentially heavy) downstream work
    setTimeout(() => {
      setState({ status: "loaded", bytes })
    }, 0)
  }

  if (state.status === "empty") {
    return <PdfLoader onFile={handleFile} />
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
