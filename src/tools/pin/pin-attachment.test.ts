import type { TLShape, TLShapeId } from "tldraw"
import { describe, expect, it } from "vitest"
import {
  computePinUpdates,
  type ShapeMove,
} from "@/tools/pin/use-pin-attachment"

const id = (s: string) => `shape:${s}` as TLShapeId

type ShapeLookup = {
  id: TLShapeId
  type: TLShape["type"]
  x: number
  y: number
}

const xy = (move: ShapeMove | undefined) =>
  move ? { x: move.x, y: move.y } : undefined

function lookupFor(shapes: ShapeLookup[]) {
  const map = new Map(shapes.map((s) => [s.id, s]))
  return (lookupId: TLShapeId) => {
    const s = map.get(lookupId)
    return s ? { type: s.type, x: s.x, y: s.y } : null
  }
}

// In the dynamic-membership model a "group" is a pin + whatever shapes are
// currently under its tip. The attachment handler computes that on each
// afterChange; the pure helper below assumes the caller has already done so.
type Group = {
  pin: { id: TLShapeId; x: number; y: number }
  membersNow: TLShapeId[]
}

describe("computePinUpdates", () => {
  it("moves the pin and the other attached shape when a 2-shape set moves", () => {
    const a: ShapeLookup = { id: id("a"), type: "geo", x: 10, y: 10 }
    const b: ShapeLookup = { id: id("b"), type: "geo", x: 50, y: 50 }
    const group: Group = {
      pin: { id: id("pin1"), x: 5, y: 5 },
      membersNow: [a.id, b.id],
    }

    const updates = computePinUpdates(a.id, 10, -5, [group], lookupFor([a, b]))

    expect(updates).toHaveLength(2)
    expect(xy(updates.find((u) => u.id === group.pin.id))).toEqual({
      x: 15,
      y: 0,
    })
    expect(xy(updates.find((u) => u.id === b.id))).toEqual({ x: 60, y: 45 })
    // The moved shape itself is not re-emitted — the caller already applied it.
    expect(updates.find((u) => u.id === a.id)).toBeUndefined()
  })

  // The key scenario that drove this refactor: a pin was placed over A + B,
  // then C was dragged into the pinned area later. Dragging any of the three
  // should move all three.
  it("moves a 3-shape membership even when the third was added after the pin", () => {
    const shapes: ShapeLookup[] = [
      { id: id("a"), type: "geo", x: 0, y: 0 },
      { id: id("b"), type: "geo", x: 20, y: 20 },
      { id: id("c"), type: "geo", x: 40, y: 40 }, // added after the pin
    ]
    // membersNow reflects current overlap — all three are under the pin's tip.
    const group: Group = {
      pin: { id: id("pin1"), x: 30, y: 30 },
      membersNow: shapes.map((s) => s.id),
    }

    const updates = computePinUpdates(id("b"), 5, 7, [group], lookupFor(shapes))

    expect(updates).toHaveLength(3)
    expect(xy(updates.find((u) => u.id === group.pin.id))).toEqual({
      x: 35,
      y: 37,
    })
    expect(xy(updates.find((u) => u.id === id("a")))).toEqual({ x: 5, y: 7 })
    expect(xy(updates.find((u) => u.id === id("c")))).toEqual({ x: 45, y: 47 })
    expect(updates.find((u) => u.id === id("b"))).toBeUndefined()
  })

  it("propagates across overlapping groups without duplicating updates", () => {
    // Pin A's members = {X, Y}, Pin B's members = {Y, Z}. Moving Y must move
    // X, Z and both pins — each exactly once.
    const x: ShapeLookup = { id: id("x"), type: "geo", x: 100, y: 100 }
    const y: ShapeLookup = { id: id("y"), type: "geo", x: 200, y: 200 }
    const z: ShapeLookup = { id: id("z"), type: "geo", x: 300, y: 300 }

    const groupA: Group = {
      pin: { id: id("pinA"), x: 0, y: 0 },
      membersNow: [x.id, y.id],
    }
    const groupB: Group = {
      pin: { id: id("pinB"), x: 1, y: 1 },
      membersNow: [y.id, z.id],
    }

    const updates = computePinUpdates(
      y.id,
      10,
      10,
      [groupA, groupB],
      lookupFor([x, y, z])
    )

    const ids = updates.map((u) => u.id)
    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
    expect(ids).toContain(groupA.pin.id)
    expect(ids).toContain(groupB.pin.id)
    expect(ids).toContain(x.id)
    expect(ids).toContain(z.id)
    expect(ids).not.toContain(y.id)
  })

  it("returns just the pin for a 1-member group (the pin follows the lone shape)", () => {
    const shape: ShapeLookup = { id: id("a"), type: "geo", x: 0, y: 0 }
    const group: Group = {
      pin: { id: id("pin1"), x: 0, y: 0 },
      membersNow: [shape.id],
    }

    const updates = computePinUpdates(
      shape.id,
      10,
      10,
      [group],
      lookupFor([shape])
    )

    expect(updates).toHaveLength(1)
    expect(updates[0]?.id).toBe(group.pin.id)
  })

  it("ignores groups whose membership does not include the moved shape", () => {
    const a: ShapeLookup = { id: id("a"), type: "geo", x: 0, y: 0 }
    const unrelated: Group = {
      pin: { id: id("pin1"), x: 0, y: 0 },
      membersNow: [id("x"), id("y")],
    }

    const updates = computePinUpdates(a.id, 5, 5, [unrelated], lookupFor([a]))

    expect(updates).toEqual([])
  })

  it("preserves each shape's type in the emitted move for round-tripping", () => {
    const a: ShapeLookup = { id: id("a"), type: "geo", x: 0, y: 0 }
    const b: ShapeLookup = { id: id("b"), type: "image", x: 0, y: 0 }
    const group: Group = {
      pin: { id: id("pin1"), x: 0, y: 0 },
      membersNow: [a.id, b.id],
    }

    const updates = computePinUpdates(a.id, 1, 1, [group], lookupFor([a, b]))

    expect(updates.find((u) => u.id === id("b"))?.type).toBe("image")
  })
})
