"use client"

import { Button } from "@/components/ui/button"
import { exportPdf } from "@/lib/pdf/export"
import { useState } from "react"

interface ExportButtonProps {
  bytes: Uint8Array
}

export function ExportButton({ bytes }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    setExporting(true)
    try {
      const blob = await exportPdf(bytes)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "export.pdf"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 100)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Button
      onClick={handleExport}
      disabled={exporting}
      aria-label={exporting ? "Exporting PDF, please wait" : "Export PDF"}
    >
      {exporting ? "Exporting…" : "Export PDF"}
    </Button>
  )
}
