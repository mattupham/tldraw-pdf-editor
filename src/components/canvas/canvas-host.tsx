"use client"

import { useState } from "react"
import Canvas from "@/components/canvas/editor"
import { ExportPdfProvider } from "@/components/canvas/export-pdf-button"
import { PdfLoader } from "@/components/canvas/pdf-loader"
import { type PdfApi, PdfShapes } from "@/components/canvas/pdf-shapes"
import { Skeleton } from "@/components/ui/skeleton"

type CanvasState =
  | { status: "empty" }
  | { status: "loading" }
  | { status: "loaded"; bytes: Uint8Array; filename: string }
  | { status: "error"; message: string }

export function CanvasHost() {
  const [state, setState] = useState<CanvasState>({ status: "empty" })
  const [pdfApi, setPdfApi] = useState<PdfApi | null>(null)

  function handleFile(bytes: Uint8Array, filename: string) {
    setPdfApi(null)
    setState({ status: "loaded", bytes, filename })
  }

  async function handleExample() {
    setPdfApi(null)
    setState({ status: "loading" })
    try {
      const res = await fetch("/sample.pdf")
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
      const buf = await res.arrayBuffer()
      setState({
        status: "loaded",
        bytes: new Uint8Array(buf),
        filename: "sample.pdf",
      })
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
      <main>
        <PdfLoader
          onFile={handleFile}
          onExample={handleExample}
          onError={handleError}
          error={state.status === "error" ? state.message : undefined}
        />
      </main>
    )
  }

  if (state.status === "loading") {
    return (
      <main className="flex min-h-svh items-center justify-center">
        <div
          role="status"
          aria-live="polite"
          aria-label="Loading PDF"
          className="flex w-full max-w-sm flex-col gap-3 p-8"
        >
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="mt-4 h-64 w-full rounded-xl" />
        </div>
      </main>
    )
  }

  return (
    <ExportPdfProvider filename={state.filename} pdfApi={pdfApi}>
      <main>
        <Canvas>
          <PdfShapes
            bytes={state.bytes}
            onError={handleError}
            onReady={setPdfApi}
          />
        </Canvas>
      </main>
    </ExportPdfProvider>
  )
}
