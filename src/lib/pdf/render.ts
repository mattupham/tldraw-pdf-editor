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
  const layout: PageDimensions[] = []
  let yOffset = 0

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    const w = vp.width
    const h = vp.height
    layout.push({ w, h, x: -w / 2, y: yOffset })
    yOffset += h + GUTTER
  }

  return layout
}

export async function renderPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  { dprCap = 3 }: { dprCap?: number } = {}
): Promise<Blob> {
  const scale = Math.min(
    typeof devicePixelRatio === "number" ? devicePixelRatio * 2 : 2,
    dprCap
  )
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

export async function renderPages(
  bytes: Uint8Array,
  { dprCap = 3 }: { dprCap?: number } = {}
): Promise<Blob[]> {
  const pdf = await openPdf(bytes)
  const blobs: Blob[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    blobs.push(await renderPage(pdf, i, { dprCap }))
  }
  return blobs
}
