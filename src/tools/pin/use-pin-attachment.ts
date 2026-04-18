"use client"

import { useEffect } from "react"
import type { Editor, TLShape, TLShapeId } from "tldraw"
import type { TLPinShape } from "./pin-shape-util"

export interface PinSnapshot {
  id: TLShapeId
  x: number
  y: number
  attachedShapeIds: readonly TLShapeId[]
}

export interface ShapeSnapshot {
  id: TLShapeId
  type: string
  x: number
  y: number
}

export interface ShapeMove extends ShapeSnapshot {}

// Module-level propagation guard. Lives outside React so it survives hook
// remounts and stays shared across any concurrent handler invocations inside
// a single editor batch.
let isPropagating = false

// Pure helper so we can unit-test the delta math without mounting tldraw.
// Returns the list of shape/pin moves triggered by `movedShapeId` shifting by
// (dx, dy). The moved shape itself is not included — the caller has already
// applied that move. Each affected shape (and pin) is emitted once, even when
// several pins' attached sets overlap.
export function computePinUpdates(
  pins: readonly PinSnapshot[],
  movedShapeId: TLShapeId,
  dx: number,
  dy: number,
  getShape: (id: TLShapeId) => ShapeSnapshot | null
): ShapeMove[] {
  const updates: ShapeMove[] = []
  const seen = new Set<TLShapeId>([movedShapeId])

  for (const pin of pins) {
    if (!pin.attachedShapeIds.includes(movedShapeId)) continue

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
    }
  }

  return updates
}

function snapshotPins(editor: Editor): PinSnapshot[] {
  const result: PinSnapshot[] = []
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== "pin") continue
    const pin = shape as TLPinShape
    result.push({
      id: pin.id,
      x: pin.x,
      y: pin.y,
      attachedShapeIds: pin.props.attachedShapeIds,
    })
  }
  return result
}

export function usePinAttachment(editor: Editor | null) {
  useEffect(() => {
    if (!editor) return

    const disposeChange = editor.sideEffects.registerAfterChangeHandler(
      "shape",
      (prev, next) => {
        if (isPropagating) return
        if (next.type === "pin") return
        if (next.x === prev.x && next.y === prev.y) return

        const pins = snapshotPins(editor)
        if (pins.length === 0) return

        const dx = next.x - prev.x
        const dy = next.y - prev.y

        const updates = computePinUpdates(pins, next.id, dx, dy, (id) => {
          const shape = editor.getShape(id)
          if (!shape) return null
          return { id: shape.id, type: shape.type, x: shape.x, y: shape.y }
        })

        if (updates.length === 0) return

        isPropagating = true
        try {
          editor.run(() => {
            editor.updateShapes(
              updates.map((u) => ({
                id: u.id,
                type: u.type,
                x: u.x,
                y: u.y,
              })) as Parameters<typeof editor.updateShapes>[0]
            )
          })
        } finally {
          isPropagating = false
        }
      }
    )

    const disposeDelete = editor.sideEffects.registerAfterDeleteHandler(
      "shape",
      (deleted: TLShape) => {
        if (deleted.type === "pin") return

        const pins = snapshotPins(editor).filter((pin) =>
          pin.attachedShapeIds.includes(deleted.id)
        )
        if (pins.length === 0) return

        editor.run(() => {
          const pinsToDelete: TLShapeId[] = []
          const pinsToUpdate: Array<{
            id: TLShapeId
            type: "pin"
            props: { attachedShapeIds: TLShapeId[] }
          }> = []

          for (const pin of pins) {
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
      disposeChange()
      disposeDelete()
    }
  }, [editor])
}
