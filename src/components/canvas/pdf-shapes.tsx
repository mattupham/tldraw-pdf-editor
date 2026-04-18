"use client"

import { useEditor } from "@/components/canvas/editor"
import {
  type PageDimensions,
  getPageLayout,
  openPdf,
  renderPage,
} from "@/lib/pdf/render"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { useEffect, useRef } from "react"
import { AssetRecordType, createShapeId } from "tldraw"
import type { Editor } from "tldraw"

const INITIAL_PAGES = 10

interface PdfShapesProps {
  bytes: Uint8Array
  onError?: (message: string) => void
}

async function createPageShape(
  editor: Editor,
  pageIndex: number,
  blob: Blob,
  dims: PageDimensions,
  urls: string[]
) {
  const url = URL.createObjectURL(blob)
  urls.push(url)
  const assetId = AssetRecordType.createId()

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
      props: { assetId, w: dims.w, h: dims.h },
    },
  ])
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
    let unsubscribe: (() => void) | undefined
    const renderedPages = new Set<number>()
    const objectUrls: string[] = []
    let layout: PageDimensions[] = []

    async function renderAndCreate(pageIndex: number) {
      if (aborted || renderedPages.has(pageIndex)) return
      const dims = layout[pageIndex]
      if (!dims) return
      renderedPages.add(pageIndex)
      const blob = await renderPage(pdf, pageIndex + 1)
      if (aborted) return
      await createPageShape(ed, pageIndex, blob, dims, objectUrls)
    }

    async function init() {
      try {
        pdf = await openPdf(bytes)
        if (aborted) return

        layout = await getPageLayout(pdf)
        if (aborted) return

        const initialCount = Math.min(INITIAL_PAGES, pdf.numPages)
        for (let i = 0; i < initialCount; i++) {
          await renderAndCreate(i)
          if (aborted) return
        }

        ed.zoomToFit({ animation: { duration: 0 } })

        if (pdf.numPages <= INITIAL_PAGES) return

        let debounceTimer: ReturnType<typeof setTimeout> | null = null

        unsubscribe = ed.store.listen(() => {
          if (debounceTimer) clearTimeout(debounceTimer)
          debounceTimer = setTimeout(() => {
            if (aborted) return
            const vp = ed.getViewportPageBounds()
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
                renderAndCreate(i).catch((err) => {
                  if (!aborted) {
                    onErrorRef.current?.(
                      err instanceof Error
                        ? err.message
                        : "Failed to render page."
                    )
                  }
                })
              }
            }
          }, 150)
        })
      } catch (err) {
        if (!aborted) {
          onErrorRef.current?.(
            err instanceof Error ? err.message : "Failed to render PDF."
          )
        }
      }
    }

    init()

    return () => {
      aborted = true
      unsubscribe?.()
      for (const url of objectUrls) URL.revokeObjectURL(url)
    }
  }, [editor, bytes])

  return null
}
