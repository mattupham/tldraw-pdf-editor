import type { TLShapeId } from "tldraw"
import { describe, expect, it } from "vitest"
import {
  type PinSnapshot,
  type ShapeSnapshot,
  computePinUpdates,
} from "./use-pin-attachment"

const id = (s: string) => `shape:${s}` as TLShapeId

const xy = (shape: ShapeSnapshot | undefined) =>
  shape ? { x: shape.x, y: shape.y } : undefined

function makeLookup(shapes: ShapeSnapshot[]) {
  const map = new Map(shapes.map((s) => [s.id, s]))
  return (lookupId: TLShapeId) => map.get(lookupId) ?? null
}

describe("computePinUpdates", () => {
  it("moves the pin and the other attached shape when a 2-shape set moves", () => {
    const shapeA: ShapeSnapshot = { id: id("a"), type: "geo", x: 10, y: 10 }
    const shapeB: ShapeSnapshot = { id: id("b"), type: "geo", x: 50, y: 50 }
    const pin: PinSnapshot = {
      id: id("pin1"),
      x: 5,
      y: 5,
      attachedShapeIds: [shapeA.id, shapeB.id],
    }

    const updates = computePinUpdates(
      [pin],
      shapeA.id,
      10,
      -5,
      makeLookup([shapeA, shapeB])
    )

    expect(updates).toHaveLength(2)
    expect(xy(updates.find((u) => u.id === pin.id))).toEqual({ x: 15, y: 0 })
    expect(xy(updates.find((u) => u.id === shapeB.id))).toEqual({
      x: 60,
      y: 45,
    })
    // The moved shape itself should not be in the update list — the caller has
    // already applied that move.
    expect(updates.find((u) => u.id === shapeA.id)).toBeUndefined()
  })

  it("moves every other member of a 3-shape set", () => {
    const shapes: ShapeSnapshot[] = [
      { id: id("a"), type: "geo", x: 0, y: 0 },
      { id: id("b"), type: "geo", x: 20, y: 20 },
      { id: id("c"), type: "image", x: 40, y: 40 },
    ]
    const pin: PinSnapshot = {
      id: id("pin1"),
      x: 0,
      y: 0,
      attachedShapeIds: shapes.map((s) => s.id),
    }

    const updates = computePinUpdates([pin], id("b"), 5, 7, makeLookup(shapes))

    expect(updates).toHaveLength(3)
    expect(xy(updates.find((u) => u.id === pin.id))).toEqual({ x: 5, y: 7 })
    expect(xy(updates.find((u) => u.id === id("a")))).toEqual({ x: 5, y: 7 })
    expect(xy(updates.find((u) => u.id === id("c")))).toEqual({ x: 45, y: 47 })
    // shape B is the mover and must not appear in the update list.
    expect(updates.find((u) => u.id === id("b"))).toBeUndefined()

    // Preserve each shape's own type so the caller can round-trip the patch.
    expect(updates.find((u) => u.id === id("c"))?.type).toBe("image")
  })

  it("propagates across overlapping sets without duplicating updates", () => {
    // A = {X, Y}, B = {Y, Z}. Moving Y must move X, Z and both pins — each
    // shape once, even though Y appears in both sets.
    const x: ShapeSnapshot = { id: id("x"), type: "geo", x: 100, y: 100 }
    const y: ShapeSnapshot = { id: id("y"), type: "geo", x: 200, y: 200 }
    const z: ShapeSnapshot = { id: id("z"), type: "geo", x: 300, y: 300 }

    const pinA: PinSnapshot = {
      id: id("pinA"),
      x: 0,
      y: 0,
      attachedShapeIds: [x.id, y.id],
    }
    const pinB: PinSnapshot = {
      id: id("pinB"),
      x: 1,
      y: 1,
      attachedShapeIds: [y.id, z.id],
    }

    const updates = computePinUpdates(
      [pinA, pinB],
      y.id,
      10,
      10,
      makeLookup([x, y, z])
    )

    const ids = updates.map((u) => u.id)
    // Four distinct targets: two pins plus X and Z. No duplicates, no Y.
    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
    expect(ids).toContain(pinA.id)
    expect(ids).toContain(pinB.id)
    expect(ids).toContain(x.id)
    expect(ids).toContain(z.id)
    expect(ids).not.toContain(y.id)

    expect(xy(updates.find((u) => u.id === x.id))).toEqual({ x: 110, y: 110 })
    expect(xy(updates.find((u) => u.id === z.id))).toEqual({ x: 310, y: 310 })
  })

  it("returns nothing for a 1-shape attached set (no grouping effect)", () => {
    const shape: ShapeSnapshot = { id: id("a"), type: "geo", x: 0, y: 0 }
    const pin: PinSnapshot = {
      id: id("pin1"),
      x: 0,
      y: 0,
      attachedShapeIds: [shape.id],
    }

    const updates = computePinUpdates(
      [pin],
      shape.id,
      10,
      10,
      makeLookup([shape])
    )

    // Ticket decision: a pin over one (or zero) shape still exists but does
    // not group-move. The pin itself still follows, so we expect just the pin.
    expect(updates).toHaveLength(1)
    expect(updates[0]?.id).toBe(pin.id)
  })

  it("skips attached ids whose shapes no longer exist (stale ids)", () => {
    // After a delete the side-effect prunes the id from each pin's set, but
    // that pruning happens in the afterDelete handler — another afterChange
    // handler running in the same tick could still see a stale id. The pure
    // helper must skip those instead of emitting undefined moves.
    const live: ShapeSnapshot = { id: id("live"), type: "geo", x: 0, y: 0 }
    const moved: ShapeSnapshot = { id: id("moved"), type: "geo", x: 0, y: 0 }
    const pin: PinSnapshot = {
      id: id("pin1"),
      x: 0,
      y: 0,
      attachedShapeIds: [moved.id, live.id, id("gone")],
    }

    const updates = computePinUpdates(
      [pin],
      moved.id,
      3,
      4,
      makeLookup([moved, live])
    )

    // Pin + live shape only — the "gone" id is silently skipped.
    expect(updates).toHaveLength(2)
    expect(updates.find((u) => u.id === id("gone"))).toBeUndefined()
    expect(xy(updates.find((u) => u.id === live.id))).toEqual({ x: 3, y: 4 })
  })

  it("ignores pins whose attached set does not contain the moved shape", () => {
    const shape: ShapeSnapshot = { id: id("a"), type: "geo", x: 0, y: 0 }
    const other: ShapeSnapshot = { id: id("b"), type: "geo", x: 0, y: 0 }
    const unrelated: PinSnapshot = {
      id: id("pin1"),
      x: 0,
      y: 0,
      attachedShapeIds: [id("c"), id("d")],
    }

    const updates = computePinUpdates(
      [unrelated],
      shape.id,
      5,
      5,
      makeLookup([shape, other])
    )

    expect(updates).toEqual([])
  })
})
