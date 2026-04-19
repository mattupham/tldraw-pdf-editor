"use client"

import type { PDFDocumentProxy } from "pdfjs-dist"
import { useEffect, useRef } from "react"
import type { Editor, TLAssetId, TLShapeId } from "tldraw"
import { AssetRecordType, createShapeId, react } from "tldraw"
import { useEditor } from "@/components/canvas/editor"
import {
  getPageLayout,
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

function createPageShape(
  editor: Editor,
  pageIndex: number,
  url: string,
  dims: PageDimensions
) {
  const assetId = AssetRecordType.createId()
  // Batch the asset + shape creation into one store update so reactive
  // subscribers flush once per page instead of twice.
  editor.run(() => {
    editor.createAssets([
      AssetRecordType.create({
        id: assetId,
        type: "image",
        props: {
          src: url,
          w: dims.w,
          h: dims.h,
          mimeType: "image/png",
          isAnimated: false,
          name: `page-${pageIndex + 1}.png`,
        },
      }),
    ])
    editor.createShapes([
      {
        id: createShapeId(),
        type: "image",
        x: dims.x,
        y: dims.y,
        // Locked so the PDF acts as a backdrop — users can't accidentally
        // drag pages out from under their annotations. Pin attachment still
        // works because it reads shape IDs, not mutable positions.
        isLocked: true,
        props: { assetId, w: dims.w, h: dims.h },
        meta: { [PDF_PAGE_META_KEY]: pageIndex },
      },
    ])
  })
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

// Synchronous base64 → data URL. The FileReader route works but adds an async
// round-trip per page; this keeps the encoding on the same microtask as the
// blob.arrayBuffer() await.
async function blobToDataUrl(blob: Blob, mime: string): Promise<string> {
  const buf = (await blob.arrayBuffer()) as ArrayBuffer
  const bytes = new Uint8Array(buf)
  const CHUNK = 8192
  let bin = ""
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return `data:${mime};base64,${btoa(bin)}`
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
    let pdf: PDFDocumentProxy
    let disposeViewportReaction: (() => void) | undefined
    const renderedPages = new Set<number>()
    let layout: PageDimensions[] = []

    async function renderAndCreate(pageIndex: number) {
      if (aborted || renderedPages.has(pageIndex)) return
      const dims = layout[pageIndex]
      if (!dims) return
      renderedPages.add(pageIndex)
      const blob = await renderPage(pdf, pageIndex + 1)
      if (aborted) return
      // tldraw's asset.src validator rejects blob: URLs (accepts only
      // http/https/data/asset), so we encode to a data URL.
      const url = await blobToDataUrl(blob, "image/png")
      if (aborted) return
      createPageShape(ed, pageIndex, url, dims)
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

        layout = await getPageLayout(pdf)
        if (aborted) return

        clearExistingPdf()
        if (aborted) return

        const initialCount = Math.min(INITIAL_PAGES, pdf.numPages)
        if (initialCount === 0) return

        // Expose renderAll as soon as layout is known — Export PDF needs it
        // even if the user clicks before all initial pages finish rasterizing.
        onReadyRef.current?.({
          renderAll: async () => {
            if (aborted) return
            const missing: number[] = []
            for (let i = 0; i < layout.length; i++) {
              if (!renderedPages.has(i)) missing.push(i)
            }
            if (missing.length === 0) return
            await mapConcurrent(missing, renderAndCreate, RENDER_CONCURRENCY)
          },
        })

        // Render page 1 first and zoom immediately so first meaningful paint
        // isn't gated on the rest of the initial batch.
        await renderAndCreate(0)
        if (aborted) return
        ed.zoomToFit({ animation: { duration: 0 } })

        // Pages 2..N render in parallel with bounded concurrency.
        if (initialCount > 1) {
          const rest = Array.from({ length: initialCount - 1 }, (_, i) => i + 1)
          await mapConcurrent(rest, renderAndCreate, RENDER_CONCURRENCY)
          if (aborted) return
        }

        if (pdf.numPages <= INITIAL_PAGES) return

        // Lazy-load the tail. `react()` auto-subscribes to whatever signals
        // `getViewportPageBounds()` reads — so this only fires on camera
        // changes, not on every unrelated store write.
        let debounceTimer: ReturnType<typeof setTimeout> | null = null
        disposeViewportReaction = react("pdf lazy pages", () => {
          const vp = ed.getViewportPageBounds()
          if (debounceTimer) clearTimeout(debounceTimer)
          debounceTimer = setTimeout(() => {
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
    }
  }, [editor, bytes])

  return null
}
