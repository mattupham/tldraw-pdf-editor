"use client"

import { useEffect } from "react"
import type { Editor, TLShape } from "tldraw"
import { PDF_PAGE_META_KEY } from "@/components/canvas/pdf-shapes"

// Blocks deletion of PDF page shapes. `isLocked: true` stops drag-selection
// and pointer drags but doesn't stop the eraser tool or `delete` key, so we
// cancel those at the store level via a side-effect. Users can still erase
// anything else on the canvas (pins, drawings, notes, etc.).
export function usePdfProtection(editor: Editor | null) {
  useEffect(() => {
    if (!editor) return
    return editor.sideEffects.registerBeforeDeleteHandler(
      "shape",
      (shape: TLShape) => {
        if (shape.type !== "image") return
        if (typeof shape.meta[PDF_PAGE_META_KEY] === "number") return false
        return
      }
    )
  }, [editor])
}
