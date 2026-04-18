"use client"

import Canvas from "@/components/canvas/editor"
import { PdfLoader } from "@/components/canvas/pdf-loader"
import { PdfShapes } from "@/components/canvas/pdf-shapes"
import { Skeleton } from "@/components/ui/skeleton"
import { useState } from "react"

type CanvasState =
  | { status: "empty" }
  | { status: "loading" }
  | { status: "loaded"; bytes: Uint8Array }
  | { status: "error"; message: string }

export function CanvasHost() {
  const [state, setState] = useState<CanvasState>({ status: "empty" })

  function handleFile(bytes: Uint8Array) {
    setState({ status: "loaded", bytes })
  }

  async function handleExample() {
    setState({ status: "loading" })
    try {
      const res = await fetch("/sample.pdf")
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
      const buf = await res.arrayBuffer()
      setState({ status: "loaded", bytes: new Uint8Array(buf) })
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Failed to load sample.",
      })
    }
  }

  function handleError(message: string) {
    setState({ status: "error", message })
  }

  if (state.status === "empty" || state.status === "error") {
    return (
      <PdfLoader
        onFile={handleFile}
        onExample={handleExample}
        onError={handleError}
        error={state.status === "error" ? state.message : undefined}
      />
    )
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

  return (
    <Canvas>
      <PdfShapes bytes={state.bytes} onError={handleError} />
    </Canvas>
  )
}
