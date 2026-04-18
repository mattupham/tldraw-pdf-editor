import { toast } from "sonner"
import type { Box, Editor } from "tldraw"

export async function exportCropImage(editor: Editor, bounds: Box) {
  const filename = "screenshot.png"
  try {
    if (typeof OffscreenCanvas === "undefined")
      throw new Error("no OffscreenCanvas")
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
  } catch {
    await fallbackExport(editor, filename)
  }
}

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
    toast.success(`Exported ${filename}`)
  } catch {
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
