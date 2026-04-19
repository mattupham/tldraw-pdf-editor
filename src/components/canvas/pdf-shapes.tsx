"use client"

import type { PDFDocumentProxy } from "pdfjs-dist"
import { useEffect, useRef } from "react"
import type { Editor, TLAssetId, TLImageAsset, TLShapeId } from "tldraw"
import { AssetRecordType, Box, createShapeId, react } from "tldraw"
import { useEditor } from "@/components/canvas/editor"
import {
  extendLayout,
  extendLayoutToY,
  openPdf,
  type PageDimensions,
  renderPage,
} from "@/lib/pdf/render"

export interface PdfApi {
  // Force-renders any pages that haven't been rasterized yet (beyond the
  // initial batch + viewport-triggered lazy loads). Used by Export PDF so the
  // output is complete even for pages the user never scrolled past.
  renderAll: () => Promise<void>
}

// Shape meta key — lets Export PDF distinguish PDF page images from any image
// shapes a user might paste onto the canvas, and orders pages deterministically.
// We also set `isPdfPage: true` so callers that only need a boolean check
// (e.g. pin-tool legacy paths) don't have to inspect the index.
export const PDF_PAGE_META_KEY = "pdfPageIndex"

// First batch rendered eagerly so the user can see/edit immediately.
const INITIAL_PAGES = 10
// Concurrency cap for the pdfjs worker — high enough to saturate on most
// devices, low enough to avoid thrashing OffscreenCanvas memory on large docs.
const RENDER_CONCURRENCY = 4
// Debounce for camera-driven lazy loading of pages beyond the initial batch.
const LAZY_LOAD_DEBOUNCE_MS = 150

interface PdfShapesProps {
  bytes: Uint8Array
  onError?: (message: string) => void
  onReady?: (api: PdfApi) => void
}

async function buildPageAsset(
  editor: Editor,
  pageIndex: number,
  blob: Blob,
  dims: PageDimensions
): Promise<TLImageAsset> {
  const name = `page-${pageIndex + 1}.png`
  const file = new File([blob], name, { type: "image/png" })
  // AssetRecordType.create returns the widened TLAsset union (image |
  // video | bookmark); the `as` narrows it based on the literal type: "image"
  // we pass. No generic overload is available on RecordType.create.
  const asset = AssetRecordType.create({
    id: AssetRecordType.createId(),
    type: "image",
    props: {
      src: "",
      w: dims.w,
      h: dims.h,
      mimeType: "image/png",
      isAnimated: false,
      name,
    },
  }) as TLImageAsset
  // uploadAsset routes through the store's assets handler (blob store wired in
  // via <Tldraw assets={blobAssetStore}>). Keeps this code oblivious to the
  // storage strategy.
  const { src, meta } = await editor.uploadAsset(asset, file)
  return {
    ...asset,
    props: { ...asset.props, src },
    meta: meta ?? asset.meta,
  }
}

function createPageShape(
  editor: Editor,
  pageIndex: number,
  asset: TLImageAsset,
  dims: PageDimensions
) {
  // Batch the asset + shape creation into one store update so reactive
  // subscribers flush once per page instead of twice.
  editor.run(() => {
    editor.createAssets([asset])
    editor.createShapes([
      {
        id: createShapeId(),
        type: "image",
        x: dims.x,
        y: dims.y,
        // Locked so the PDF acts as a backdrop — users can't accidentally
        // drag pages out from under their annotations.
        isLocked: true,
        // `isPdfPage` is the cheap boolean flag; `pdfPageIndex` orders pages
        // for Export PDF and for clearExistingPdf's purge.
        meta: { isPdfPage: true, [PDF_PAGE_META_KEY]: pageIndex },
        props: { assetId: asset.id, w: dims.w, h: dims.h },
      },
    ])
  })
}

// Bounding box of a set of page rectangles, in page-space. Returned as a
// tldraw Box so we can hand it to editor.zoomToBounds.
function unionBounds(pages: PageDimensions[]): Box {
  if (pages.length === 0) return new Box(0, 0, 0, 0)
  const [first, ...rest] = pages
  if (!first) return new Box(0, 0, 0, 0)
  let minX = first.x
  let minY = first.y
  let maxX = first.x + first.w
  let maxY = first.y + first.h
  for (const p of rest) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x + p.w > maxX) maxX = p.x + p.w
    if (p.y + p.h > maxY) maxY = p.y + p.h
  }
  return new Box(minX, minY, maxX - minX, maxY - minY)
}

// Bounded-concurrency parallel map. pdfjs queues jobs on its worker so we don't
// need a global queue — the cap just bounds concurrent OffscreenCanvas memory.
async function mapConcurrent<T>(
  indices: number[],
  fn: (i: number) => Promise<T>,
  concurrency: number
): Promise<void> {
  let cursor = 0
  const workers = Array.from(
    { length: Math.min(concurrency, indices.length) },
    async () => {
      while (cursor < indices.length) {
        const next = indices[cursor++]
        if (next === undefined) return
        await fn(next)
      }
    }
  )
  await Promise.all(workers)
}

export function PdfShapes({ bytes, onError, onReady }: PdfShapesProps) {
  const editor = useEditor()
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  useEffect(() => {
    if (!editor) return

    const ed = editor
    let aborted = false
    let pdf: PDFDocumentProxy | undefined
    let disposeViewportReaction: (() => void) | undefined
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const renderedPages = new Set<number>()
    const layout: PageDimensions[] = []

    async function renderAndCreate(pageIndex: number) {
      if (aborted || renderedPages.has(pageIndex) || !pdf) return
      const dims = layout[pageIndex]
      if (!dims) return
      renderedPages.add(pageIndex)
      const blob = await renderPage(pdf, pageIndex + 1)
      if (aborted) return
      const asset = await buildPageAsset(ed, pageIndex, blob, dims)
      if (aborted) return
      createPageShape(ed, pageIndex, asset, dims)
    }

    function notifyError(err: unknown) {
      if (aborted) return
      onErrorRef.current?.(
        err instanceof Error ? err.message : "Failed to render PDF."
      )
    }

    // Drops any PDF-page shapes (and their assets) left over from a previous
    // document so a second load doesn't pile new pages on top of the old ones.
    // User-inserted shapes are preserved — we only touch records we created.
    function clearExistingPdf() {
      const stalePageIds: TLShapeId[] = []
      const staleAssetIds: TLAssetId[] = []
      for (const shape of ed.getCurrentPageShapes()) {
        if (shape.type !== "image") continue
        if (typeof shape.meta[PDF_PAGE_META_KEY] !== "number") continue
        stalePageIds.push(shape.id)
        const props = (shape as { props: { assetId: TLAssetId | null } }).props
        if (props.assetId) staleAssetIds.push(props.assetId)
      }
      if (stalePageIds.length === 0) return
      ed.run(() => {
        ed.deleteShapes(stalePageIds)
        if (staleAssetIds.length > 0) ed.deleteAssets(staleAssetIds)
      })
    }

    async function init() {
      try {
        pdf = await openPdf(bytes)
        if (aborted) return

        clearExistingPdf()
        if (aborted) return

        const initialCount = Math.min(INITIAL_PAGES, pdf.numPages)
        if (initialCount === 0) return

        // Only fetch page-metadata for the initial batch. For larger decks,
        // the tail loads page-by-page as the user scrolls into view.
        await extendLayout(pdf, layout, initialCount - 1)
        if (aborted) return

        // Expose renderAll as soon as layout is known — Export PDF may be
        // clicked while the initial batch is still rasterizing, and needs
        // to force-render every remaining page before assembling the file.
        onReadyRef.current?.({
          renderAll: async () => {
            if (aborted || !pdf) return
            // Ensure the whole deck's layout is resolved before rendering.
            await extendLayout(pdf, layout, pdf.numPages - 1)
            if (aborted) return
            const missing: number[] = []
            for (let i = 0; i < layout.length; i++) {
              if (!renderedPages.has(i)) missing.push(i)
            }
            if (missing.length === 0) return
            await mapConcurrent(missing, renderAndCreate, RENDER_CONCURRENCY)
          },
        })

        // Camera first, pages second. zoomToBounds over the precomputed
        // layout lands the camera in the right place before any shapes
        // exist, so as pages render in they slot into the viewport.
        const bounds = unionBounds(layout.slice(0, initialCount))
        ed.zoomToBounds(bounds, { animation: { duration: 0 } })

        // Page 1 first so first meaningful paint isn't gated on the batch;
        // pages 2..N in parallel with bounded concurrency.
        await renderAndCreate(0)
        if (aborted) return
        if (initialCount > 1) {
          const rest = Array.from({ length: initialCount - 1 }, (_, i) => i + 1)
          await mapConcurrent(rest, renderAndCreate, RENDER_CONCURRENCY)
          if (aborted) return
        }

        if (pdf.numPages <= INITIAL_PAGES) return

        disposeViewportReaction = react("pdf lazy pages", () => {
          const vp = ed.getViewportPageBounds()
          if (debounceTimer) clearTimeout(debounceTimer)
          debounceTimer = setTimeout(async () => {
            if (aborted || !pdf) return
            try {
              await extendLayoutToY(pdf, layout, vp.maxY)
            } catch (err) {
              notifyError(err)
              return
            }
            if (aborted) return
            for (let i = INITIAL_PAGES; i < layout.length; i++) {
              if (renderedPages.has(i)) continue
              const page = layout[i]
              if (!page) continue
              if (
                page.x < vp.maxX &&
                page.x + page.w > vp.minX &&
                page.y < vp.maxY &&
                page.y + page.h > vp.minY
              ) {
                renderAndCreate(i).catch(notifyError)
              }
            }
          }, LAZY_LOAD_DEBOUNCE_MS)
        })
      } catch (err) {
        notifyError(err)
      }
    }

    init()

    return () => {
      aborted = true
      disposeViewportReaction?.()
      if (debounceTimer) clearTimeout(debounceTimer)
      // Tear down the pdfjs worker so swapping PDFs (or unmounting mid-render)
      // doesn't leak a worker thread per load. destroy() can reject if a
      // render is in-flight; we don't await it.
      pdf?.destroy().catch(() => {})
    }
  }, [editor, bytes])

  return null
}
