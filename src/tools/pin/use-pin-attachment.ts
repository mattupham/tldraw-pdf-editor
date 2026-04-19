"use client"

import { useEffect } from "react"
import type { Editor, TLShape, TLShapeId } from "tldraw"
import type { TLPinShape } from "@/tools/pin/pin-shape-util"

export interface PinSnapshot {
  id: TLShapeId
  x: number
  y: number
  attachedShapeIds: readonly TLShapeId[]
}

export interface ShapeSnapshot {
  id: TLShapeId
  type: TLShape["type"]
  x: number
  y: number
}

export type ShapeMove = ShapeSnapshot

// Pure helper so we can unit-test the delta math without mounting tldraw.
// Returns the list of shape/pin moves triggered by `movedShapeId` shifting by
// (dx, dy). The moved shape itself is not included — the caller has already
// applied that move. Each affected shape (and pin) is emitted once.
//
// Walks the transitive closure via BFS: if pin A attaches {X,Y} and pin B
// attaches {Y,Z}, dragging X ripples X → Y → Z. Spec §4 calls this out
// ("when Y moves, X, Y, Z all move"). Doing the closure here — rather than
// relying on afterChange re-firing for propagated shapes — lets the hook
// keep its simple consume-at-fire recursion guard without losing transitive
// reach.
export function computePinUpdates(
  pins: Iterable<PinSnapshot>,
  movedShapeId: TLShapeId,
  dx: number,
  dy: number,
  getShape: (id: TLShapeId) => ShapeSnapshot | null
): ShapeMove[] {
  const pinList = Array.from(pins)
  const updates: ShapeMove[] = []
  const seen = new Set<TLShapeId>([movedShapeId])
  const queue: TLShapeId[] = [movedShapeId]

  while (queue.length > 0) {
    const current = queue.shift() as TLShapeId
    for (const pin of pinList) {
      if (!pin.attachedShapeIds.includes(current)) continue

      if (!seen.has(pin.id)) {
        seen.add(pin.id)
        updates.push({
          id: pin.id,
          type: "pin",
          x: pin.x + dx,
          y: pin.y + dy,
        })
      }

      for (const shapeId of pin.attachedShapeIds) {
        if (seen.has(shapeId)) continue
        const shape = getShape(shapeId)
        if (!shape) continue
        seen.add(shapeId)
        updates.push({
          id: shapeId,
          type: shape.type,
          x: shape.x + dx,
          y: shape.y + dy,
        })
        // Propagate onwards: this shape may be in another pin's attached
        // set, transitively extending the group.
        queue.push(shapeId)
      }
    }
  }

  return updates
}

function snapshotOfPin(shape: TLPinShape): PinSnapshot {
  return {
    id: shape.id,
    x: shape.x,
    y: shape.y,
    attachedShapeIds: shape.props.attachedShapeIds,
  }
}

export function usePinAttachment(editor: Editor | null) {
  useEffect(() => {
    if (!editor) return

    // Per-editor propagation guard. A plain boolean isn't enough: tldraw's
    // flushAtomicCallbacks while-loop processes each round of pendingAfterEvents
    // in a new iteration, resetting handler context between rounds. When shapeA
    // moves and we propagate shapeB, shapeB's afterChange fires in the *next*
    // iteration with the boolean already reset, triggering another cascade.
    // Tracking each propagated ID lets us skip exactly those shapes later.
    const propagatedIds = new Set<TLShapeId>()

    // Pin index kept in sync via sideEffects. Avoids walking every shape on
    // the page (O(shapes)) on every shape afterChange during a drag; lookup
    // now scales with the number of pins, not total shapes on the canvas.
    const pinIndex = new Map<TLShapeId, PinSnapshot>()
    for (const shape of editor.getCurrentPageShapes()) {
      if (shape.type === "pin") {
        pinIndex.set(shape.id, snapshotOfPin(shape as TLPinShape))
      }
    }

    const disposeCreate = editor.sideEffects.registerAfterCreateHandler(
      "shape",
      (created) => {
        if (created.type !== "pin") return
        pinIndex.set(created.id, snapshotOfPin(created as TLPinShape))
      }
    )

    const disposeChange = editor.sideEffects.registerAfterChangeHandler(
      "shape",
      (prev, next) => {
        // Keep the pin index in sync on any pin change (including moves we
        // propagate ourselves — the index needs to reflect new positions).
        if (next.type === "pin") {
          pinIndex.set(next.id, snapshotOfPin(next as TLPinShape))
          return
        }

        if (propagatedIds.has(next.id)) {
          propagatedIds.delete(next.id)
          return
        }
        if (next.x === prev.x && next.y === prev.y) return

        // Skip resizes. Dragging a top/left handle also changes x/y (alongside
        // w/h in props), and we don't want to drag attached shapes along on
        // resize — only on pure translate.
        const prevW = (prev.props as { w?: number }).w
        const prevH = (prev.props as { h?: number }).h
        const nextW = (next.props as { w?: number }).w
        const nextH = (next.props as { h?: number }).h
        if (prevW !== nextW || prevH !== nextH) return

        if (pinIndex.size === 0) return

        const dx = next.x - prev.x
        const dy = next.y - prev.y

        const updates = computePinUpdates(
          pinIndex.values(),
          next.id,
          dx,
          dy,
          (id) => {
            const shape = editor.getShape(id)
            if (!shape) return null
            return { id: shape.id, type: shape.type, x: shape.x, y: shape.y }
          }
        )

        if (updates.length === 0) return

        for (const update of updates) {
          propagatedIds.add(update.id)
        }
        editor.run(() => {
          editor.updateShapes(
            updates.map((u) => ({
              id: u.id,
              type: u.type,
              x: u.x,
              y: u.y,
            }))
          )
        })
        // Don't sweep propagatedIds after the run — tldraw's
        // flushAtomicCallbacks drains pendingAfterEvents across several
        // iterations of its while-loop. afterChange for shape B may fire in a
        // *later* iteration than the one this run returned on. Deleting ids
        // here would pull the token out from under that deferred handler and
        // cause B's afterChange to look like a real drag, re-propagating into
        // an infinite cascade. The consume-at-fire delete above is the right
        // (and only) place to drain.
      }
    )

    const disposeDelete = editor.sideEffects.registerAfterDeleteHandler(
      "shape",
      (deleted: TLShape) => {
        if (deleted.type === "pin") {
          pinIndex.delete(deleted.id)
          return
        }

        const affected: PinSnapshot[] = []
        for (const pin of pinIndex.values()) {
          if (pin.attachedShapeIds.includes(deleted.id)) affected.push(pin)
        }
        if (affected.length === 0) return

        editor.markHistoryStoppingPoint("pin attachment cascade")
        editor.run(() => {
          const pinsToDelete: TLShapeId[] = []
          const pinsToUpdate: Array<{
            id: TLShapeId
            type: "pin"
            props: { attachedShapeIds: TLShapeId[] }
          }> = []

          for (const pin of affected) {
            const nextIds = pin.attachedShapeIds.filter(
              (id) => id !== deleted.id
            )
            if (nextIds.length < 2) {
              pinsToDelete.push(pin.id)
            } else {
              pinsToUpdate.push({
                id: pin.id,
                type: "pin",
                props: { attachedShapeIds: nextIds },
              })
            }
          }

          if (pinsToUpdate.length > 0) {
            editor.updateShapes(pinsToUpdate)
          }
          if (pinsToDelete.length > 0) {
            editor.deleteShapes(pinsToDelete)
          }
        })
      }
    )

    return () => {
      disposeCreate()
      disposeChange()
      disposeDelete()
    }
  }, [editor])
}
