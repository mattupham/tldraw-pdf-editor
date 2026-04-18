"use client"

import type { PDFDocumentProxy } from "pdfjs-dist"
import { useEffect, useRef } from "react"
import type { Editor, TLImageAsset } from "tldraw"
import { AssetRecordType, createShapeId, react } from "tldraw"
import { useEditor } from "@/components/canvas/editor"
import {
  getPageLayout,
  openPdf,
  type PageDimensions,
  renderPage,
} from "@/lib/pdf/render"

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
}

async function buildPageAsset(
  editor: Editor,
  pageIndex: number,
  blob: Blob,
  dims: PageDimensions
): Promise<TLImageAsset> {
  const name = `page-${pageIndex + 1}.png`
  const file = new File([blob], name, { type: "image/png" })
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
  // uploadAsset routes through the store's assets handler (FileReader-backed
  // data URL by default, or whatever custom TLAssetStore the host wires in).
  // Keeps this code oblivious to the storage strategy.
  const { src, meta } = await editor.uploadAsset(asset, file)
  return {
    ...asset,
    props: { ...asset.props, src },
    meta: meta ?? asset.meta,
  }
}

function createPageShape(
  editor: Editor,
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
        isLocked: true,
        meta: { isPdfPage: true },
        props: { assetId: asset.id, w: dims.w, h: dims.h },
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

export function PdfShapes({ bytes, onError }: PdfShapesProps) {
  const editor = useEditor()
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  useEffect(() => {
    if (!editor) return

    const ed = editor
    let aborted = false
    let pdf: PDFDocumentProxy
    let disposeViewportReaction: (() => void) | undefined
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const renderedPages = new Set<number>()
    let layout: PageDimensions[] = []

    async function renderAndCreate(pageIndex: number) {
      if (aborted || renderedPages.has(pageIndex)) return
      const dims = layout[pageIndex]
      if (!dims) return
      renderedPages.add(pageIndex)
      const blob = await renderPage(pdf, pageIndex + 1)
      if (aborted) return
      const asset = await buildPageAsset(ed, pageIndex, blob, dims)
      if (aborted) return
      createPageShape(ed, asset, dims)
    }

    function notifyError(err: unknown) {
      if (aborted) return
      onErrorRef.current?.(
        err instanceof Error ? err.message : "Failed to render PDF."
      )
    }

    async function init() {
      try {
        pdf = await openPdf(bytes)
        if (aborted) return

        layout = await getPageLayout(pdf)
        if (aborted) return

        const initialCount = Math.min(INITIAL_PAGES, pdf.numPages)
        if (initialCount === 0) return

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
          // Re-fit after the initial batch lands — the first zoom only saw
          // page 1, which left pages 2..N off-viewport for multi-page decks.
          ed.zoomToFit({ animation: { duration: 0 } })
        }

        if (pdf.numPages <= INITIAL_PAGES) return

        // Lazy-load the tail. `react()` auto-subscribes to whatever signals
        // `getViewportPageBounds()` reads — so this only fires on camera
        // changes, not on every unrelated store write.
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
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [editor, bytes])

  return null
}
