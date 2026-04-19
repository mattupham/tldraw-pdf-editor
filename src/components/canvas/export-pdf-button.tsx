"use client"

import { Loader2 } from "lucide-react"
import { createContext, type ReactNode, useContext, useState } from "react"
import { toast } from "sonner"
import { useEditor } from "@/components/canvas/editor"
import type { PdfApi } from "@/components/canvas/pdf-shapes"
import { Button } from "@/components/ui/button"
import { exportAnnotatedPdf } from "@/lib/pdf/export"

interface ExportPdfContextValue {
  filename: string
  // Null until PdfShapes has loaded enough to know the total page count — the
  // button stays disabled in that window so clicks can't produce a
  // partially-rasterized export.
  pdfApi: PdfApi | null
}

// Lets ExportPdfButton live in tldraw's SharePanel slot (where it sits above
// the style panel) without threading props through tldraw's component map.
const ExportPdfContext = createContext<ExportPdfContextValue | null>(null)

export function ExportPdfProvider({
  filename,
  pdfApi,
  children,
}: ExportPdfContextValue & { children: ReactNode }) {
  return (
    <ExportPdfContext.Provider value={{ filename, pdfApi }}>
      {children}
    </ExportPdfContext.Provider>
  )
}

export function ExportPdfButton() {
  const ctx = useContext(ExportPdfContext)
  const editor = useEditor()
  const [isExporting, setIsExporting] = useState(false)

  if (!ctx) return null
  const { filename, pdfApi } = ctx
  const disabled = !editor || !pdfApi || isExporting

  async function handleClick() {
    if (!editor || !pdfApi) return
    setIsExporting(true)
    try {
      // Force-render any lazy-loaded pages the user never scrolled past so
      // the exported PDF isn't missing tail pages.
      await pdfApi.renderAll()
      const out = await exportAnnotatedPdf(editor, filename)
      toast.success(`Exported ${out}`)
    } catch (err) {
      console.error("[export-pdf] failed:", err)
      toast.error(
        err instanceof Error ? err.message : "Export failed. Please try again."
      )
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Button onClick={handleClick} disabled={disabled} aria-label="Export PDF">
      {isExporting ? (
        <>
          <Loader2 className="animate-spin" aria-hidden="true" />
          Exporting…
        </>
      ) : (
        "Export PDF"
      )}
    </Button>
  )
}
