import { GlobalWorkerOptions, getDocument } from "pdfjs-dist"
import type { PDFDocumentProxy } from "pdfjs-dist"

let workerSet = false

function ensureWorker() {
  if (workerSet) return
  GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
  workerSet = true
}

export interface PageDimensions {
  w: number
  h: number
  x: number
  y: number
}

const GUTTER = 20

export async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  ensureWorker()
  return getDocument({ data: bytes }).promise
}

export async function getPageLayout(
  pdf: PDFDocumentProxy
): Promise<PageDimensions[]> {
  const pages = await Promise.all(
    Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1))
  )

  const layout: PageDimensions[] = []
  let yOffset = 0

  for (const page of pages) {
    const vp = page.getViewport({ scale: 1 })
    layout.push({ w: vp.width, h: vp.height, x: -vp.width / 2, y: yOffset })
    yOffset += vp.height + GUTTER
  }

  return layout
}

export async function renderPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  { dprCap = 3 }: { dprCap?: number } = {}
): Promise<Blob> {
  const scale = Math.min(devicePixelRatio * 2, dprCap)
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const canvas = new OffscreenCanvas(
    Math.round(viewport.width),
    Math.round(viewport.height)
  )
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("OffscreenCanvas 2d context unavailable")
  // pdfjs types require HTMLCanvasElement but accepts OffscreenCanvas at runtime
  await page.render({
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    canvas: canvas as unknown as HTMLCanvasElement,
    viewport,
  }).promise
  return canvas.convertToBlob({ type: "image/png" })
}
