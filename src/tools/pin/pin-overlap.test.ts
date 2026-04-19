import type { TLShapeId } from "tldraw"
import { describe, expect, it } from "vitest"
import {
  pickShapesUnderPinTip,
  pinTipPoint,
  pointInBounds,
} from "@/tools/pin/pin-overlap"
import { PIN_HEIGHT, PIN_WIDTH } from "@/tools/pin/pin-shape-util"

const id = (s: string) => `shape:${s}` as TLShapeId

describe("pointInBounds", () => {
  it("includes the margin on every side", () => {
    const b = { x: 10, y: 10, w: 20, h: 20 }
    // Just outside on each side, within margin.
    expect(pointInBounds({ x: 6, y: 20 }, b, 5)).toBe(true)
    expect(pointInBounds({ x: 35, y: 20 }, b, 5)).toBe(true)
    expect(pointInBounds({ x: 20, y: 6 }, b, 5)).toBe(true)
    expect(pointInBounds({ x: 20, y: 35 }, b, 5)).toBe(true)
    // Beyond margin on each side.
    expect(pointInBounds({ x: 4, y: 20 }, b, 5)).toBe(false)
    expect(pointInBounds({ x: 37, y: 20 }, b, 5)).toBe(false)
  })
})

describe("pickShapesUnderPinTip", () => {
  // The regression scenario from the user's report: a pin placed over A + B,
  // with C dragged into the pinned area later. All three overlap the tip, so
  // all three must be returned.
  it("returns every overlapping shape, regardless of creation order", () => {
    const tip = { x: 50, y: 50 }
    const a = {
      id: id("a"),
      type: "geo" as const,
      bounds: { x: 0, y: 0, w: 100, h: 100 },
    }
    const b = {
      id: id("b"),
      type: "geo" as const,
      bounds: { x: 20, y: 20, w: 80, h: 80 },
    }
    const c = {
      id: id("c"),
      type: "geo" as const,
      bounds: { x: 40, y: 40, w: 40, h: 40 },
    }
    const hits = pickShapesUnderPinTip(tip, [a, b, c], 6)
    expect(hits.sort()).toEqual([id("a"), id("b"), id("c")])
  })

  it("skips pins — pins never attach to each other", () => {
    const tip = { x: 0, y: 0 }
    const pin = {
      id: id("pin1"),
      type: "pin" as const,
      bounds: { x: -10, y: -10, w: 20, h: 20 },
    }
    expect(pickShapesUnderPinTip(tip, [pin], 0)).toEqual([])
  })

  it("honours margin so thin strokes still get hit", () => {
    const tip = { x: 50, y: 15 }
    const line = {
      id: id("line"),
      type: "line" as const,
      bounds: { x: 0, y: 10, w: 100, h: 0 },
    }
    // Within 6-px margin below the line.
    expect(pickShapesUnderPinTip(tip, [line], 6)).toEqual([id("line")])
    // Outside the margin.
    expect(pickShapesUnderPinTip({ x: 50, y: 20 }, [line], 6)).toEqual([])
  })
})

describe("pinTipPoint", () => {
  it("anchors the tip at the pin's bottom-centre", () => {
    const pin = { x: 100, y: 200 }
    expect(pinTipPoint(pin)).toEqual({
      x: 100 + PIN_WIDTH / 2,
      y: 200 + PIN_HEIGHT,
    })
  })
})
