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
}

async function createPageShape(
  editor: Editor,
  pageIndex: number,
  blob: Blob,
  dims: PageDimensions
) {
  const url = URL.createObjectURL(blob)
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

export function PdfShapes({ bytes }: PdfShapesProps) {
  const editor = useEditor()
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!editor || loadedRef.current) return
    loadedRef.current = true

    const ed = editor
    let pdf: PDFDocumentProxy
    let unsubscribe: (() => void) | undefined
    const renderedPages = new Set<number>()
    let layout: PageDimensions[] = []

    async function renderAndCreate(pageIndex: number) {
      if (renderedPages.has(pageIndex)) return
      const dims = layout[pageIndex]
      if (!dims) return
      renderedPages.add(pageIndex)
      const blob = await renderPage(pdf, pageIndex + 1)
      await createPageShape(ed, pageIndex, blob, dims)
    }

    async function init() {
      pdf = await openPdf(bytes)
      layout = await getPageLayout(pdf)

      const initialCount = Math.min(INITIAL_PAGES, pdf.numPages)
      for (let i = 0; i < initialCount; i++) {
        await renderAndCreate(i)
      }

      ed.zoomToFit({ animation: { duration: 0 } })

      if (pdf.numPages <= INITIAL_PAGES) return

      let debounceTimer: ReturnType<typeof setTimeout> | null = null

      unsubscribe = ed.store.listen(() => {
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
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
              renderAndCreate(i)
            }
          }
        }, 150)
      })
    }

    init()

    return () => {
      unsubscribe?.()
    }
  }, [editor, bytes])

  return null
}
