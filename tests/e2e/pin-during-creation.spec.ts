import { expect, test } from "@playwright/test"

// Regression: while a creation tool (geo/draw/arrow/line) is active, a new
// shape whose bounds grow to cross the pin tip mid-gesture must NOT drag the
// existing pinned siblings along with it. Group-move only fires once the
// user re-selects the new shape and translates it in the select tool.
test("drawing a new shape across a pin doesn't drag the pinned group", async ({
  page,
}) => {
  await page.goto("/")
  await page.getByRole("button", { name: "Use an example" }).click()
  await expect(page.locator(".tl-canvas")).toBeVisible({ timeout: 20_000 })
  await page.waitForFunction(() => !!window.__editor, { timeout: 15_000 })

  const ids = await page.evaluate(() => {
    const e = window.__editor
    if (!e) throw new Error("editor not mounted")
    const ts = Date.now()
    const aId = `shape:pc-a-${ts}`
    const bId = `shape:pc-b-${ts}`
    const pinId = `shape:pc-pin-${ts}`
    const cId = `shape:pc-c-${ts}`
    e.createShape({
      id: aId as never,
      type: "geo",
      x: 400,
      y: 400,
      props: { geo: "rectangle", w: 120, h: 100 },
    })
    e.createShape({
      id: bId as never,
      type: "geo",
      x: 440,
      y: 430,
      props: { geo: "rectangle", w: 120, h: 100 },
    })
    // Pin tip = (pin.x + 12, pin.y + 32) = (472, 480) — inside both rects.
    e.createShape({
      id: pinId as never,
      type: "pin",
      x: 460,
      y: 448,
      props: {},
    })
    return { aId, bId, pinId, cId }
  })

  // Simulate the last tick of a non-select creation gesture: shape C exists
  // with its w/h, then x/y shifts so its bounds cross the pin tip. The guard
  // in use-pin-attachment.ts should short-circuit propagation because the
  // current tool id is not "select".
  const midDrag = await page.evaluate((ids) => {
    const e = window.__editor
    if (!e) throw new Error("editor not mounted")
    const snap = (() => {
      const a = e.getShape(ids.aId as never)
      const b = e.getShape(ids.bId as never)
      const pin = e.getShape(ids.pinId as never)
      if (!a || !b || !pin) throw new Error("setup shapes missing")
      return {
        a: { x: a.x, y: a.y },
        b: { x: b.x, y: b.y },
        pin: { x: pin.x, y: pin.y },
      }
    })()

    e.setCurrentTool("geo")
    // Seed C off to the side so it doesn't already cover the pin tip.
    e.createShape({
      id: ids.cId as never,
      type: "geo",
      x: 800,
      y: 800,
      props: { geo: "rectangle", w: 120, h: 120 },
    })
    // Now translate-only: w/h unchanged, x/y crosses the pin tip. Without
    // the tool-id guard, readTranslateDelta reads this as a real translate
    // and propagates to every sibling in the pin group.
    e.updateShape({
      id: ids.cId as never,
      type: "geo",
      x: 450,
      y: 450,
    })

    const a = e.getShape(ids.aId as never)
    const b = e.getShape(ids.bId as never)
    const pin = e.getShape(ids.pinId as never)
    if (!a || !b || !pin) throw new Error("post-draw shapes missing")
    return {
      aDelta: { x: a.x - snap.a.x, y: a.y - snap.a.y },
      bDelta: { x: b.x - snap.b.x, y: b.y - snap.b.y },
      pinDelta: { x: pin.x - snap.pin.x, y: pin.y - snap.pin.y },
    }
  }, ids)

  expect(midDrag.aDelta).toEqual({ x: 0, y: 0 })
  expect(midDrag.bDelta).toEqual({ x: 0, y: 0 })
  expect(midDrag.pinDelta).toEqual({ x: 0, y: 0 })

  // After the creation gesture ends: switch to select, translate C. Now C is
  // a live member of the pin group (its bounds contain the tip), so the full
  // group moves together.
  const afterRelease = await page.evaluate((ids) => {
    const e = window.__editor
    if (!e) throw new Error("editor not mounted")
    e.setCurrentTool("select")

    const snap = (() => {
      const a = e.getShape(ids.aId as never)
      const b = e.getShape(ids.bId as never)
      const c = e.getShape(ids.cId as never)
      const pin = e.getShape(ids.pinId as never)
      if (!a || !b || !c || !pin) throw new Error("pre-translate missing")
      return {
        a: { x: a.x, y: a.y },
        b: { x: b.x, y: b.y },
        c: { x: c.x, y: c.y },
        pin: { x: pin.x, y: pin.y },
      }
    })()

    e.updateShapes([
      {
        id: ids.cId as never,
        type: "geo",
        x: snap.c.x + 30,
        y: snap.c.y + 15,
      },
    ])

    const a = e.getShape(ids.aId as never)
    const b = e.getShape(ids.bId as never)
    const pin = e.getShape(ids.pinId as never)
    if (!a || !b || !pin) throw new Error("post-translate missing")
    return {
      aDelta: { x: a.x - snap.a.x, y: a.y - snap.a.y },
      bDelta: { x: b.x - snap.b.x, y: b.y - snap.b.y },
      pinDelta: { x: pin.x - snap.pin.x, y: pin.y - snap.pin.y },
    }
  }, ids)

  expect(afterRelease.aDelta).toEqual({ x: 30, y: 15 })
  expect(afterRelease.bDelta).toEqual({ x: 30, y: 15 })
  expect(afterRelease.pinDelta).toEqual({ x: 30, y: 15 })
})
