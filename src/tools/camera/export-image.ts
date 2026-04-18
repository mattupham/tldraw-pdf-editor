import { toast } from "sonner"
import type { Box, Editor } from "tldraw"

export async function exportCropImage(editor: Editor, bounds: Box) {
  const filename = "screenshot.png"
  try {
    const shapeIds = [...editor.getShapeIdsInsideBounds(bounds)]
    const { blob } = await editor.toImage(shapeIds, {
      bounds,
      format: "png",
      background: true,
      pixelRatio: window.devicePixelRatio,
      padding: 0,
    })
    downloadBlob(blob, filename)
    toast.success(`Exported ${filename}`)
  } catch (err) {
    console.error(
      "[camera] toImage failed, falling back to html-to-image:",
      err
    )
    await fallbackExport(editor, filename)
  }
}

// Fallback: captures the full canvas container (no cropping).
// Used when toImage() throws (e.g. missing WebGL context in some environments).
async function fallbackExport(editor: Editor, filename: string) {
  try {
    const { toPng } = await import("html-to-image")
    const container = editor.getContainer()
    const dataUrl = await toPng(container)
    const a = document.createElement("a")
    a.href = dataUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    toast.success(`Exported ${filename} (full canvas — crop unavailable)`)
  } catch (err) {
    console.error("[camera] fallback export failed:", err)
    toast.error("Export failed")
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 100)
}
