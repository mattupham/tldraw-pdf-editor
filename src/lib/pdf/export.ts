import { PDFDocument } from "pdf-lib"
import {
  Box,
  type Editor,
  type TLImageShape,
  type TLShape,
  type TLShapeId,
} from "tldraw"
import { PDF_PAGE_META_KEY } from "@/components/canvas/pdf-shapes"

// Cap on parallel editor.toImage calls. Kept conservative because each call
// builds a scratch DOM for SVG rasterization — more parallelism buys little on
// the typical deck and risks memory pressure on a 100-page export.
const EXPORT_CONCURRENCY = 2

interface PdfPageShape {
  id: TLShapeId
  pageIndex: number
  x: number
  y: number
  w: number
  h: number
}

function collectPdfPageShapes(editor: Editor): PdfPageShape[] {
  const pages: PdfPageShape[] = []
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== "image") continue
    const pageIndex = shape.meta[PDF_PAGE_META_KEY]
    if (typeof pageIndex !== "number") continue
    const { props } = shape as TLImageShape
    pages.push({
      id: shape.id,
      pageIndex,
      x: shape.x,
      y: shape.y,
      w: props.w,
      h: props.h,
    })
  }
  pages.sort((a, b) => a.pageIndex - b.pageIndex)
  return pages
}

async function rasterizePage(
  editor: Editor,
  page: PdfPageShape,
  bounds: Box
): Promise<Uint8Array> {
  const shapeIds = pickShapesForPage(editor, page, bounds)
  // Padding defaults to 32 in tldraw; zero it so the output matches the page
  // rectangle exactly instead of being enlarged.
  const { blob } = await editor.toImage(shapeIds, {
    bounds,
    format: "png",
    background: true,
    pixelRatio: window.devicePixelRatio,
    padding: 0,
  })
  const buf = await blob.arrayBuffer()
  return new Uint8Array(buf)
}

// Page image + any non-PDF shape whose bounds intersect this page. Excludes
// other PDF pages so gutter overlap doesn't bleed a neighbour into the export.
function pickShapesForPage(
  editor: Editor,
  page: PdfPageShape,
  bounds: Box
): TLShapeId[] {
  const seen = new Set<TLShapeId>([page.id])
  const result: TLShapeId[] = [page.id]
  for (const id of editor.getShapeIdsInsideBounds(bounds)) {
    if (seen.has(id)) continue
    const shape = editor.getShape(id) as TLShape | undefined
    if (!shape) continue
    if (shape.type === "image" && shape.meta[PDF_PAGE_META_KEY] !== undefined) {
      continue
    }
    seen.add(id)
    result.push(id)
  }
  return result
}

function downloadBytes(bytes: Uint8Array, filename: string) {
  // Cast works around TS's Uint8Array<ArrayBufferLike> → BlobPart mismatch;
  // runtime behaviour is unchanged.
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

export function annotatedFilename(original: string): string {
  const trimmed = original.trim() || "document.pdf"
  const withoutExt = trimmed.replace(/\.pdf$/i, "")
  return `${withoutExt}-annotated.pdf`
}

// Bounded-concurrency parallel map preserving input order. pdfjs queues jobs
// on its worker, so the cap here bounds concurrent scratch-DOM memory during
// rasterization, not pdfjs throughput.
async function mapConcurrentOrdered<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const i = cursor++
        const item = items[i]
        if (item === undefined) return
        results[i] = await fn(item, i)
      }
    }
  )
  await Promise.all(workers)
  return results
}

export async function exportAnnotatedPdf(
  editor: Editor,
  originalFilename: string
): Promise<string> {
  const pages = collectPdfPageShapes(editor)
  if (pages.length === 0) {
    throw new Error("No PDF pages on canvas to export.")
  }

  // Rasterize in parallel, then assemble sequentially — pdf-lib mutations
  // aren't safe to interleave, but embedPng + drawImage are cheap.
  const rasters = await mapConcurrentOrdered(
    pages,
    EXPORT_CONCURRENCY,
    (page) =>
      rasterizePage(editor, page, new Box(page.x, page.y, page.w, page.h))
  )

  const doc = await PDFDocument.create()
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    const pngBytes = rasters[i]
    if (!page || !pngBytes) continue
    const img = await doc.embedPng(pngBytes)
    const pdfPage = doc.addPage([page.w, page.h])
    pdfPage.drawImage(img, { x: 0, y: 0, width: page.w, height: page.h })
  }

  const out = await doc.save()
  const filename = annotatedFilename(originalFilename)
  downloadBytes(out, filename)
  return filename
}
