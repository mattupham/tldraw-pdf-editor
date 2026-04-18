"use client"

import { Button } from "@/components/ui/button"
import { useRef } from "react"

interface PdfLoaderProps {
  onFile: (bytes: Uint8Array) => void
}

export function PdfLoader({ onFile }: PdfLoaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      onFile(new Uint8Array(reader.result as ArrayBuffer))
    }
    reader.readAsArrayBuffer(file)
    // Reset so the same file can be re-selected
    e.target.value = ""
  }

  async function handleExample() {
    const res = await fetch("/sample.pdf")
    const buf = await res.arrayBuffer()
    onFile(new Uint8Array(buf))
  }

  return (
    <div className="flex min-h-svh items-center justify-center">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Open a PDF</h1>
          <p className="text-sm text-muted-foreground">
            Load a file from your device or try a sample.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button onClick={() => inputRef.current?.click()}>Open PDF</Button>
          <Button variant="outline" onClick={handleExample}>
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
