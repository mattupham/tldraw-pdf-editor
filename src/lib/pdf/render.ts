import type { PDFDocumentProxy } from "pdfjs-dist"

// Dynamic import keeps pdfjs-dist out of the SSR bundle — it accesses DOMMatrix
// and other browser globals at module evaluation time, crashing Next.js builds.
async function pdfjs() {
  return import("pdfjs-dist")
}

let workerSet = false

async function ensureWorker() {
  if (workerSet) return
  const { GlobalWorkerOptions } = await pdfjs()
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
  await ensureWorker()
  const { getDocument } = await pdfjs()
  // pdfjs transfers ownership of the backing ArrayBuffer to its worker, which
  // detaches the original. Clone here so repeat callers (e.g. Export PDF after
  // the initial render) don't hit "ArrayBuffer is already detached".
  //
  // Hardening flags: isEvalSupported=false blocks pdfjs from `eval`ing font
  // programs (closes a class of CVEs around malicious PDFs). disableAutoFetch
  // + disableStream disable speculative range fetches — we already have the
  // bytes in memory, so there's nothing to fetch.
  return getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    disableAutoFetch: true,
    disableStream: true,
  }).promise
}

/**
 * Extend a cumulative page-layout array up to (and including) `throughIndex`.
 *
 * Mutates `layout` in place. Only fetches viewports for pages not already
 * resolved, so repeated calls amortise to O(pages-visited) instead of the
 * O(pdf.numPages) the old eager `getPageLayout` paid on every open.
 *
 * Why incremental: the viewport listener needs to know cumulative y-offsets
 * to hit-test tail pages against the camera rect. But we don't want to
 * fetch metadata for pages the user may never scroll to. Walking lazily
 * keeps big decks (100+ pages) off the critical path.
 */
export async function extendLayout(
  pdf: PDFDocumentProxy,
  layout: PageDimensions[],
  throughIndex: number
): Promise<void> {
  const target = Math.min(throughIndex, pdf.numPages - 1)
  if (target < layout.length) return
  while (layout.length <= target) {
    const i = layout.length
    const page = await pdf.getPage(i + 1)
    const vp = page.getViewport({ scale: 1 })
    const prev = layout[i - 1]
    const y = prev ? prev.y + prev.h + GUTTER : 0
    layout.push({ w: vp.width, h: vp.height, x: -vp.width / 2, y })
  }
}

/**
 * Extend the layout until either every page is resolved or the cumulative
 * bottom edge passes `yTarget` (usually the viewport's maxY). Returns early
 * once the layout is "deep enough" for a visibility check.
 */
export async function extendLayoutToY(
  pdf: PDFDocumentProxy,
  layout: PageDimensions[],
  yTarget: number
): Promise<void> {
  while (layout.length < pdf.numPages) {
    const last = layout[layout.length - 1]
    if (last && last.y + last.h >= yTarget) return
    await extendLayout(pdf, layout, layout.length)
  }
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
