"use client"

import { useEffect } from "react"
import { type Editor, react, type TLShape, type TLShapeId } from "tldraw"
import {
  findShapesUnderPinTip,
  PIN_HIT_MARGIN,
  type PinBounds,
  pinTipPoint,
  pointInBounds,
} from "@/tools/pin/pin-overlap"

export interface ShapeMove {
  id: TLShapeId
  type: TLShape["type"]
  x: number
  y: number
}

// Input to the pure propagation helper — one entry per pin on the canvas
// with the shapes currently under its tip. The caller is responsible for
// re-adding the moved shape to a group's `membersNow` when its pre-move
// bounds contained the pin's tip but its current bounds no longer do (it
// may have slid out while the user was dragging).
export interface PinGroupInput {
  pin: { id: TLShapeId; x: number; y: number }
  membersNow: readonly TLShapeId[]
}

// BFS through the pin graph starting from `movedShapeId`. Handles transitive
// chains: pin1 = {X,Y}, pin2 = {Y,Z} → moving X ripples X → Y → Z. Each
// record is emitted once regardless of overlap; the moved shape itself is
// not emitted (the caller already applied that move).
export function computePinUpdates(
  movedShapeId: TLShapeId,
  dx: number,
  dy: number,
  groups: Iterable<PinGroupInput>,
  getShape: (
    id: TLShapeId
  ) => { type: TLShape["type"]; x: number; y: number } | null
): ShapeMove[] {
  const groupsArr = [...groups]
  const updates: ShapeMove[] = []
  const moved = new Set<TLShapeId>([movedShapeId])
  const pinQueue: PinGroupInput[] = []

  for (const g of groupsArr) {
    if (g.membersNow.includes(movedShapeId) && !moved.has(g.pin.id)) {
      moved.add(g.pin.id)
      pinQueue.push(g)
    }
  }

  while (pinQueue.length > 0) {
    const g = pinQueue.shift()
    if (!g) break
    updates.push({
      id: g.pin.id,
      type: "pin",
      x: g.pin.x + dx,
      y: g.pin.y + dy,
    })

    for (const memberId of g.membersNow) {
      if (moved.has(memberId)) continue
      moved.add(memberId)
      const s = getShape(memberId)
      if (!s) continue
      updates.push({
        id: memberId,
        type: s.type,
        x: s.x + dx,
        y: s.y + dy,
      })

      for (const g2 of groupsArr) {
        if (moved.has(g2.pin.id)) continue
        if (g2.membersNow.includes(memberId)) {
          moved.add(g2.pin.id)
          pinQueue.push(g2)
        }
      }
    }
  }

  return updates
}

// Cached prev-bounds per shape so we can answer "was the pin attached to this
// shape *before* the move?" without reconstructing bounds from a stale record
// (arrows, lines, draw strokes all have prop-based geometry that doesn't
// reduce to x/y/w/h).
const lastBoundsByShape = new Map<TLShapeId, PinBounds>()

// Resize guard + x/y-first-with-bounds-fallback delta. x/y works for geo/
// note/image/draw (their top-left rides with the drag); bounds work for
// arrows and lines (prop geometry leaves x/y untouched on body drags).
// Returns null for resizes so top/left handles don't drag siblings.
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

// Every pin on the current page → the shapes currently under its tip. The
// caller hands in the moved shape's pre-membership bounds (drag-start snapshot
// during a translate, else prev-tick bounds). Membership for the moved shape
// is decided purely by those bounds — not by its current geometry — so a
// shape that slides into the pin area mid-drag is NOT treated as a member
// until the user releases and starts a new drag. For siblings, current
// geometry is fine (they haven't moved yet during this afterChange).
function buildPinGroups(
  editor: Editor,
  movedId: TLShapeId,
  preMembershipBounds: PinBounds | undefined
): PinGroupInput[] {
  const groups: PinGroupInput[] = []
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== "pin") continue
    const tip = pinTipPoint(shape)
    const membersNow = findShapesUnderPinTip(editor, tip).filter(
      (id) => id !== movedId
    )
    if (
      preMembershipBounds &&
      pointInBounds(tip, preMembershipBounds, PIN_HIT_MARGIN)
    ) {
      membersNow.push(movedId)
    }
    groups.push({
      pin: { id: shape.id, x: shape.x, y: shape.y },
      membersNow,
    })
  }
  return groups
}

export function usePinAttachment(editor: Editor | null) {
  useEffect(() => {
    if (!editor) return

    // Per-flush propagation guard. tldraw's atomic-flush loop processes each
    // round of pending events in a fresh iteration, so a plain boolean would
    // be re-evaluated and trigger recursive cascades — tracking each
    // propagated ID lets us consume the token exactly at afterChange time.
    const propagatedIds = new Set<TLShapeId>()

    // Drag-start bounds per shape, snapshotted on the first afterChange of a
    // select.translating gesture. Used so a shape that slides INTO a pin area
    // mid-drag isn't treated as an instant group member — membership is
    // locked to the bounds at gesture start. Cleared when translating ends
    // (the react subscription below); next drag re-snapshots from scratch.
    const translateStartBoundsByShape = new Map<TLShapeId, PinBounds>()

    const disposeReact = react("pin-translate-session", () => {
      if (!editor.isIn("select.translating")) {
        translateStartBoundsByShape.clear()
      }
    })

    // Seed the bounds cache so fallback deltas work on the first drag after
    // mount (esp. for arrow/line body drags where x/y doesn't change).
    for (const shape of editor.getCurrentPageShapes()) {
      const b = editor.getShapePageBounds(shape.id)
      if (b) lastBoundsByShape.set(shape.id, { x: b.x, y: b.y, w: b.w, h: b.h })
    }

    const disposeChange = editor.sideEffects.registerAfterChangeHandler(
      "shape",
      (prev, next) => {
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
        // pre-move geometry to answer "was any pin attached to this shape?".
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

        // Only propagate while the select tool is active. While a non-select
        // tool is creating a shape, its x/y can change tick-to-tick without
        // w/h changing — readTranslateDelta reads that as a real translate
        // and drags the pin group along with the still-being-drawn shape.
        // Broader than isIn("select.translating") on purpose: keyboard arrow-
        // nudges fire in select.idle, and programmatic moves (undo, paste,
        // tests) also run under the select tool — all must still propagate.
        if (editor.getCurrentToolId() !== "select") return

        // Snapshot drag-start bounds on the first tick of a translating
        // gesture. prevBounds at this point is the shape's geometry before
        // this tick's change, which on tick 1 IS the pre-drag state. The
        // snapshot freezes membership for the whole gesture: a shape that
        // slides into a pin area is NOT treated as a member until drop +
        // next drag.
        if (
          editor.isIn("select.translating") &&
          !translateStartBoundsByShape.has(next.id) &&
          prevBounds
        ) {
          translateStartBoundsByShape.set(next.id, prevBounds)
        }

        const delta = readTranslateDelta(prev, next, prevBounds, nextBounds)
        if (!delta) return

        const preMembershipBounds =
          translateStartBoundsByShape.get(next.id) ?? prevBounds
        const groups = buildPinGroups(editor, next.id, preMembershipBounds)
        if (groups.length === 0) return

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

        // Arrow double-move guard: skip arrows already being carried by
        // tldraw's own binding to another sibling in this batch.
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
        // Don't sweep propagatedIds after the run — tldraw's atomic-flush
        // loop drains pendingAfterEvents across several while-loop iterations,
        // so a propagated shape's afterChange may fire in a later pass than
        // this run returns on. Clearing here would pull the guard token out
        // from under that deferred handler and re-propagate infinitely.
      }
    )

    const disposeDelete = editor.sideEffects.registerAfterDeleteHandler(
      "shape",
      (deleted) => {
        lastBoundsByShape.delete(deleted.id)
        translateStartBoundsByShape.delete(deleted.id)
      }
    )

    // Seed the cache on creation too — afterChange only fires on updates, so
    // shapes created after mount have no prev bounds on their first drag,
    // which would leave buildPinGroups without the pre-drag geometry it
    // needs to decide membership of the moved shape.
    const disposeCreate = editor.sideEffects.registerAfterCreateHandler(
      "shape",
      (shape) => {
        const b = editor.getShapePageBounds(shape.id)
        if (b) {
          lastBoundsByShape.set(shape.id, {
            x: b.x,
            y: b.y,
            w: b.w,
            h: b.h,
          })
        }
      }
    )

    return () => {
      disposeReact()
      disposeChange()
      disposeCreate()
      disposeDelete()
    }
  }, [editor])
}
