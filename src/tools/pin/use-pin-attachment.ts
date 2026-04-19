"use client"

import { useEffect } from "react"
import type { Editor, TLShape, TLShapeId } from "tldraw"
import {
  findShapesUnderPinTip,
  PIN_HIT_MARGIN,
  type PinBounds,
  pinTipPoint,
  pointInBounds,
} from "@/tools/pin/pin-overlap"
import type { TLPinShape } from "@/tools/pin/pin-shape-util"

export interface ShapeMove {
  id: TLShapeId
  type: TLShape["type"]
  x: number
  y: number
}

// Pure propagation helper. Given a moved shape + its delta, the set of pins
// that were attached to it *before* the move, and the other shapes currently
// under each of those pins, returns the list of sibling + pin moves to apply.
// Each affected record is emitted once even when multiple pins overlap the
// same sibling.
export interface PinGroupInput {
  pin: { id: TLShapeId; x: number; y: number }
  // IDs of shapes currently under this pin's tip. Should include the moved
  // shape when that shape was attached to this pin; the helper uses it to
  // decide whether to emit this pin/group at all.
  membersNow: readonly TLShapeId[]
}

export function computePinUpdates(
  movedShapeId: TLShapeId,
  dx: number,
  dy: number,
  groups: Iterable<PinGroupInput>,
  getShape: (
    id: TLShapeId
  ) => { type: TLShape["type"]; x: number; y: number } | null
): ShapeMove[] {
  const updates: ShapeMove[] = []
  const seen = new Set<TLShapeId>([movedShapeId])

  for (const { pin, membersNow } of groups) {
    if (!membersNow.includes(movedShapeId)) continue

    if (!seen.has(pin.id)) {
      seen.add(pin.id)
      updates.push({ id: pin.id, type: "pin", x: pin.x + dx, y: pin.y + dy })
    }

    for (const memberId of membersNow) {
      if (seen.has(memberId)) continue
      const s = getShape(memberId)
      if (!s) continue
      seen.add(memberId)
      updates.push({
        id: memberId,
        type: s.type,
        x: s.x + dx,
        y: s.y + dy,
      })
    }
  }

  return updates
}

// Cached prev-bounds per shape so we can answer "was the pin attached to this
// shape *before* the move?" without relying on bounds we can't reconstruct
// from a stale record (arrows, lines, draw strokes with prop-based geometry).
const lastBoundsByShape = new Map<TLShapeId, PinBounds>()

// Resize guard + x/y-first-with-bounds-fallback delta detector. x/y works for
// rects/notes/images/draws (they translate via their top-left); bounds work
// for arrows and lines (prop-based geometry leaves x/y untouched on body
// drags). Returns null for resizes so handles don't drag siblings along.
function readTranslateDelta(
  prev: TLShape,
  next: TLShape,
  prevBounds: PinBounds | undefined,
  nextBounds: PinBounds | undefined
): { dx: number; dy: number } | null {
  const prevW = (prev.props as { w?: number }).w
  const prevH = (prev.props as { h?: number }).h
  const nextW = (next.props as { w?: number }).w
  const nextH = (next.props as { h?: number }).h
  if (prevW !== nextW || prevH !== nextH) return null

  const xyDx = next.x - prev.x
  const xyDy = next.y - prev.y
  if (xyDx !== 0 || xyDy !== 0) return { dx: xyDx, dy: xyDy }

  if (!prevBounds || !nextBounds) return null
  const dx = nextBounds.x - prevBounds.x
  const dy = nextBounds.y - prevBounds.y
  if (dx === 0 && dy === 0) return null
  return { dx, dy }
}

// True when `candidate` is an arrow bound (by tldraw's own arrow binding) to
// any shape in `siblings`. We skip propagating translates to such arrows
// because the arrow-binding system already carries them along — doubling our
// delta would overshoot.
function arrowBoundToSibling(
  editor: Editor,
  candidate: TLShape,
  siblings: Iterable<TLShapeId>
): boolean {
  if (candidate.type !== "arrow") return false
  const bindings = editor.getBindingsFromShape(candidate.id, "arrow")
  if (bindings.length === 0) return false
  const sibSet = new Set(siblings)
  for (const b of bindings) {
    if (sibSet.has(b.toId)) return true
  }
  return false
}

export function usePinAttachment(editor: Editor | null) {
  useEffect(() => {
    if (!editor) return

    // Per-flush propagation guard. tldraw's atomic-flush loop processes each
    // round of pending events in a fresh iteration, so a plain boolean would
    // be re-evaluated and trigger recursive cascades — tracking each
    // propagated ID lets us skip them exactly once.
    const propagatedIds = new Set<TLShapeId>()

    // Seed the bounds cache so fallback deltas work on the first drag after
    // mount (esp. for arrow/line body drags where x/y doesn't change).
    for (const shape of editor.getCurrentPageShapes()) {
      const b = editor.getShapePageBounds(shape.id)
      if (b) lastBoundsByShape.set(shape.id, { x: b.x, y: b.y, w: b.w, h: b.h })
    }

    const disposeChange = editor.sideEffects.registerAfterChangeHandler(
      "shape",
      (prev, next) => {
        // Refresh the cache for pins so their bounds track any propagation
        // we just applied; no further work is needed for pins themselves.
        if (next.type === "pin") {
          const b = editor.getShapePageBounds(next.id)
          if (b) {
            lastBoundsByShape.set(next.id, {
              x: b.x,
              y: b.y,
              w: b.w,
              h: b.h,
            })
          }
          return
        }

        // Read prev bounds *before* refreshing the cache — we need the
        // pre-move geometry to answer "was any pin attached to this shape?"
        const prevBounds = lastBoundsByShape.get(next.id)
        const nextBoundsRaw = editor.getShapePageBounds(next.id)
        const nextBounds = nextBoundsRaw
          ? {
              x: nextBoundsRaw.x,
              y: nextBoundsRaw.y,
              w: nextBoundsRaw.w,
              h: nextBoundsRaw.h,
            }
          : undefined
        if (nextBounds) lastBoundsByShape.set(next.id, nextBounds)

        if (propagatedIds.has(next.id)) {
          propagatedIds.delete(next.id)
          return
        }

        const delta = readTranslateDelta(prev, next, prevBounds, nextBounds)
        if (!delta) return

        // Find every pin whose tip was inside this shape's pre-move bounds.
        // That set is the shapes the user would *expect* to drag together —
        // regardless of when each sibling was added to the canvas.
        const attachedPins = collectAttachedPins(editor, prevBounds)
        if (attachedPins.length === 0) return

        // For each of those pins, the propagation group is whatever is
        // currently under its tip (which may include shapes that were added
        // *after* the pin was placed — the whole point of this refactor).
        const groups: PinGroupInput[] = attachedPins.map((pin) => ({
          pin: { id: pin.id, x: pin.x, y: pin.y },
          membersNow: findShapesUnderPinTip(editor, pinTipPoint(pin)),
        }))

        const updates = computePinUpdates(
          next.id,
          delta.dx,
          delta.dy,
          groups,
          (id) => {
            const s = editor.getShape(id)
            if (!s) return null
            return { type: s.type, x: s.x, y: s.y }
          }
        )
        if (updates.length === 0) return

        // Arrow double-move guard: skip arrows that tldraw's own binding is
        // already carrying along (bound to another sibling in this batch).
        const siblingIds = updates.map((u) => u.id)
        siblingIds.push(next.id)
        const filtered = updates.filter((u) => {
          if (u.type !== "arrow") return true
          const candidate = editor.getShape(u.id)
          if (!candidate) return true
          return !arrowBoundToSibling(editor, candidate, siblingIds)
        })
        if (filtered.length === 0) return

        for (const u of filtered) propagatedIds.add(u.id)
        editor.run(() => {
          editor.updateShapes(
            filtered.map((u) => ({ id: u.id, type: u.type, x: u.x, y: u.y }))
          )
        })
      }
    )

    const disposeDelete = editor.sideEffects.registerAfterDeleteHandler(
      "shape",
      (deleted) => {
        lastBoundsByShape.delete(deleted.id)
      }
    )

    return () => {
      disposeChange()
      disposeDelete()
    }
  }, [editor])
}

// Walks all pins on the current page and keeps those whose tip falls inside
// `shapeBounds` (expanded by the pin hit margin). Used to decide, at afterChange
// time, which pins were "over" the shape that just moved.
function collectAttachedPins(
  editor: Editor,
  shapeBounds: PinBounds | undefined
): TLPinShape[] {
  if (!shapeBounds) return []
  const attached: TLPinShape[] = []
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== "pin") continue
    const tip = pinTipPoint(shape)
    if (pointInBounds(tip, shapeBounds, PIN_HIT_MARGIN)) {
      attached.push(shape as TLPinShape)
    }
  }
  return attached
}
