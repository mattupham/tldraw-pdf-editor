import type { Editor, TLShape, TLShapeId } from "tldraw"
import { PDF_PAGE_META_KEY } from "@/components/canvas/pdf-shapes"
import { PIN_HEIGHT, PIN_WIDTH } from "@/tools/pin/pin-shape-util"

// Extra pixels added when testing whether the pin's tip falls inside a shape.
// Generous enough that thin strokes (draw/line/highlight/unfilled geo) stay
// reachable; small enough not to bleed onto neighbouring shapes.
export const PIN_HIT_MARGIN = 6

export interface PinBounds {
  x: number
  y: number
  w: number
  h: number
}

// Pure helper — used by both unit tests and the live attachment handler.
// Given a tip point and a list of (id, type, bounds) candidates, returns the
// IDs whose bounds contain the point (expanded by margin).
export function pickShapesUnderPinTip(
  tip: { x: number; y: number },
  candidates: Iterable<{
    id: TLShapeId
    type: TLShape["type"]
    bounds: PinBounds
  }>,
  margin: number
): TLShapeId[] {
  const hits: TLShapeId[] = []
  for (const { id, type, bounds } of candidates) {
    if (type === "pin") continue
    if (pointInBounds(tip, bounds, margin)) hits.push(id)
  }
  return hits
}

export function pointInBounds(
  p: { x: number; y: number },
  b: PinBounds,
  margin: number
): boolean {
  return (
    p.x >= b.x - margin &&
    p.x <= b.x + b.w + margin &&
    p.y >= b.y - margin &&
    p.y <= b.y + b.h + margin
  )
}

// Geometry of the pin's "tip" — the visually-pointed end of the pushpin.
// The pin shape has its top-left at (shape.x, shape.y) with PIN_WIDTH × PIN_HEIGHT
// dimensions; the tip is at the bottom-centre so shapes sitting beneath the
// visible pin tip are the ones grouped.
export function pinTipPoint(shape: { x: number; y: number }): {
  x: number
  y: number
} {
  return { x: shape.x + PIN_WIDTH / 2, y: shape.y + PIN_HEIGHT }
}

// Editor-backed wrapper. Walks the current page and returns every non-pin,
// non-PDF shape whose bounds currently contain the pin's tip. PDF pages are
// filtered because they're the backdrop; otherwise every pin would silently
// pull its host page along on every drag.
export function findShapesUnderPinTip(
  editor: Editor,
  tip: { x: number; y: number },
  margin: number = PIN_HIT_MARGIN
): TLShapeId[] {
  const ids: TLShapeId[] = []
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type === "pin") continue
    if (isPdfPageShape(shape)) continue
    const b = editor.getShapePageBounds(shape.id)
    if (!b) continue
    if (pointInBounds(tip, { x: b.x, y: b.y, w: b.w, h: b.h }, margin)) {
      ids.push(shape.id)
    }
  }
  return ids
}

function isPdfPageShape(shape: TLShape): boolean {
  return (
    shape.type === "image" && typeof shape.meta[PDF_PAGE_META_KEY] === "number"
  )
}
