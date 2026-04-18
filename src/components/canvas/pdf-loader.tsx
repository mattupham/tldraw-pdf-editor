"use client"

import { Button } from "@/components/ui/button"
import { useRef } from "react"

interface PdfLoaderProps {
  onFile: (bytes: Uint8Array) => void
  onExample: () => void
  onError: (message: string) => void
  error?: string
}

export function PdfLoader({
  onFile,
  onExample,
  onError,
  error,
}: PdfLoaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    try {
      const buf = await file.arrayBuffer()
      onFile(new Uint8Array(buf))
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to read file.")
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Open a PDF</h2>
          <p className="text-sm text-muted-foreground">
            Load a file from your device or try a sample.
          </p>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-col gap-2">
          <Button onClick={() => inputRef.current?.click()}>Open PDF</Button>
          <Button variant="outline" onClick={onExample}>
            Use an example
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </div>
  )
}
