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
    expect(updates.find((u) => u.id === a.id)).toBeUndefined()
  })

  // The key scenario that drove the dynamic-membership refactor: a pin was
  // placed over A + B, then C was dragged into the pinned area later.
  // Dragging any of the three must move all three.
  it("moves a 3-shape membership even when the third was added after the pin", () => {
    const shapes: ShapeLookup[] = [
      { id: id("a"), type: "geo", x: 0, y: 0 },
      { id: id("b"), type: "geo", x: 20, y: 20 },
      { id: id("c"), type: "geo", x: 40, y: 40 },
    ]
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

  // MATT-146 (sliding-in): models the output of buildPinGroupsFromSnapshot
  // for a shape that wasn't a pin member when the drag began. The snapshot
  // freezes membership at drag start, so C is absent from membersNow even
  // though its current bounds may now cover the pin tip — propagation must
  // not fire. The next drag (after pointer-up, snapshot re-taken) will see
  // C as a member and move the whole group.
  it("drops propagation for a shape whose drag-start membership excludes it", () => {
    const slidingIn: ShapeLookup = { id: id("c"), type: "geo", x: 0, y: 0 }
    const preExisting: Group = {
      pin: { id: id("pin1"), x: 0, y: 0 },
      membersNow: [id("x"), id("y")],
    }

    const updates = computePinUpdates(
      slidingIn.id,
      10,
      10,
      [preExisting],
      lookupFor([slidingIn])
    )

    expect(updates).toEqual([])
  })

  // MATT-146 (staying-a-member): models the output of
  // buildPinGroupsFromSnapshot for a pre-drag member dragged any distance.
  // The snapshot keeps A in membersNow for the whole gesture, so
  // computePinUpdates continues to propagate to the pin + siblings no
  // matter how far the group has translated.
  it("keeps propagating to a pre-drag member across a long drag", () => {
    const a: ShapeLookup = { id: id("a"), type: "geo", x: 500, y: 500 }
    const b: ShapeLookup = { id: id("b"), type: "geo", x: 550, y: 550 }
    const group: Group = {
      // Snapshot taken at drag start when A, B sat under the pin tip.
      pin: { id: id("pin1"), x: 510, y: 510 },
      membersNow: [a.id, b.id],
    }

    const updates = computePinUpdates(
      a.id,
      300,
      200,
      [group],
      lookupFor([a, b])
    )

    expect(updates).toHaveLength(2)
    expect(xy(updates.find((u) => u.id === group.pin.id))).toEqual({
      x: 810,
      y: 710,
    })
    expect(xy(updates.find((u) => u.id === b.id))).toEqual({ x: 850, y: 750 })
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

  // Transitive chain: pin1 = {X, Y}, pin2 = {Y, Z}. Moving X should ripple
  // X → Y → Z via the shared Y bridge — pin2 never contains X directly but
  // must still be picked up. Without BFS the helper would emit pin1 + Y and
  // stop there, leaving Z + pin2 behind.
  it("ripples transitively across chained pins when a non-shared node moves", () => {
    const x: ShapeLookup = { id: id("x"), type: "geo", x: 0, y: 0 }
    const y: ShapeLookup = { id: id("y"), type: "geo", x: 100, y: 100 }
    const z: ShapeLookup = { id: id("z"), type: "geo", x: 200, y: 200 }

    const pin1: Group = {
      pin: { id: id("pin1"), x: 10, y: 10 },
      membersNow: [x.id, y.id],
    }
    const pin2: Group = {
      pin: { id: id("pin2"), x: 110, y: 110 },
      membersNow: [y.id, z.id],
    }

    const updates = computePinUpdates(
      x.id,
      5,
      -3,
      [pin1, pin2],
      lookupFor([x, y, z])
    )

    const ids = updates.map((u) => u.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain(pin1.pin.id)
    expect(ids).toContain(pin2.pin.id)
    expect(ids).toContain(y.id)
    expect(ids).toContain(z.id)
    expect(ids).not.toContain(x.id)

    expect(xy(updates.find((u) => u.id === y.id))).toEqual({ x: 105, y: 97 })
    expect(xy(updates.find((u) => u.id === z.id))).toEqual({ x: 205, y: 197 })
    expect(xy(updates.find((u) => u.id === pin1.pin.id))).toEqual({
      x: 15,
      y: 7,
    })
    expect(xy(updates.find((u) => u.id === pin2.pin.id))).toEqual({
      x: 115,
      y: 107,
    })
  })
})
