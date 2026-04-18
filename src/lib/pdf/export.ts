import { PDFDocument } from "pdf-lib"
import { getPageLayout, openPdf, renderPage } from "./render"

export async function exportPdf(bytes: Uint8Array): Promise<Blob> {
  const src = await openPdf(bytes)
  const layout = await getPageLayout(src)
  const doc = await PDFDocument.create()

  for (let i = 0; i < src.numPages; i++) {
    const blob = await renderPage(src, i + 1, { dprCap: 2 })
    const pngBytes = new Uint8Array((await blob.arrayBuffer()) as ArrayBuffer)
    const img = await doc.embedPng(pngBytes)
    const dims = layout[i]
    if (!dims) continue
    const page = doc.addPage([dims.w, dims.h])
    page.drawImage(img, { x: 0, y: 0, width: dims.w, height: dims.h })
  }

  const saved = (await doc.save()) as Uint8Array<ArrayBuffer>
  return new Blob([saved], { type: "application/pdf" })
}
