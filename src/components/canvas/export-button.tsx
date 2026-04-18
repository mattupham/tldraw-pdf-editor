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
    <div className="pointer-events-none fixed inset-0 z-10">
      <div className="pointer-events-auto absolute right-4 top-4">
        <Button onClick={handleExport} disabled={exporting}>
          {exporting ? "Exporting…" : "Export PDF"}
        </Button>
      </div>
    </div>
  )
}
