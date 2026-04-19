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
    // createShape fires afterCreate, not afterChange — the handler under
    // test only sees the subsequent updateShape. Seed C clear of the pin
    // tip so the create itself couldn't even have grabbed the group.
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

// Locks in the broader-gate choice (tool-id === "select" rather than
// isIn("select.translating")): keyboard arrow-key nudges fire in
// select.idle, not select.translating, and must still propagate to the
// whole pin group.
test("keyboard arrow nudge of a pinned shape moves the whole group", async ({
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
    const aId = `shape:kn-a-${ts}`
    const bId = `shape:kn-b-${ts}`
    const pinId = `shape:kn-pin-${ts}`
    e.createShape({
      id: aId as never,
      type: "geo",
      x: 300,
      y: 300,
      props: { geo: "rectangle", w: 120, h: 100 },
    })
    e.createShape({
      id: bId as never,
      type: "geo",
      x: 340,
      y: 330,
      props: { geo: "rectangle", w: 120, h: 100 },
    })
    // Pin tip = (pin.x + 12, pin.y + 32) = (372, 380) — inside both rects.
    e.createShape({
      id: pinId as never,
      type: "pin",
      x: 360,
      y: 348,
      props: {},
    })
    e.setCurrentTool("select")
    e.select(aId as never)
    return { aId, bId, pinId }
  })

  // Focus the canvas so the ArrowRight keypress reaches tldraw's handlers
  // (otherwise the key lands on <body> and nudge never fires). Going
  // through the a11y skip-link is flaky because it's visually out of the
  // viewport; focus the container div directly.
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>(".tl-container")
    if (!canvas) throw new Error("tldraw container missing")
    canvas.focus()
  })
  await page.keyboard.press("ArrowRight")

  const result = await page.evaluate((ids) => {
    const e = window.__editor
    if (!e) throw new Error("editor not mounted")
    const a = e.getShape(ids.aId as never)
    const b = e.getShape(ids.bId as never)
    const pin = e.getShape(ids.pinId as never)
    if (!a || !b || !pin) throw new Error("missing")
    return {
      aDelta: { x: a.x - 300, y: a.y - 300 },
      bDelta: { x: b.x - 340, y: b.y - 330 },
      pinDelta: { x: pin.x - 360, y: pin.y - 348 },
    }
  }, ids)

  // tldraw's default arrow-key nudge is a positive integer on the x axis.
  // We assert the sibling + pin deltas match A's delta exactly (no drift)
  // and that no y movement leaked in.
  expect(result.aDelta.x).toBeGreaterThan(0)
  expect(result.aDelta.y).toBe(0)
  expect(result.bDelta).toEqual(result.aDelta)
  expect(result.pinDelta).toEqual(result.aDelta)
})

// Belt-and-suspenders: exercise the full pointer pipeline. Activate the
// rectangle tool via its toolbar button and drag a rectangle that crosses
// the pin tip mid-gesture. The guard must still short-circuit propagation
// because the current tool id is "geo" during the gesture.
test("real mouse drag: drawing a rectangle across the pin keeps siblings put", async ({
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
    const aId = `shape:mc-a-${ts}`
    const bId = `shape:mc-b-${ts}`
    const pinId = `shape:mc-pin-${ts}`
    e.createShape({
      id: aId as never,
      type: "geo",
      x: 600,
      y: 600,
      props: { geo: "rectangle", w: 160, h: 120 },
    })
    e.createShape({
      id: bId as never,
      type: "geo",
      x: 640,
      y: 620,
      props: { geo: "rectangle", w: 160, h: 120 },
    })
    // Pin tip = (pin.x + 12, pin.y + 32) = (672, 680) — inside both rects.
    e.createShape({
      id: pinId as never,
      type: "pin",
      x: 660,
      y: 648,
      props: {},
    })
    return { aId, bId, pinId }
  })

  const coords = await page.evaluate(() => {
    const e = window.__editor
    if (!e) throw new Error("editor not mounted")
    // Start clear of the pin tip (672,680), drag down-right so final
    // bounds enclose it. The mid point stays outside the pin tip; the end
    // point crosses it.
    return {
      start: e.pageToScreen({ x: 420, y: 420 }),
      mid: e.pageToScreen({ x: 560, y: 560 }),
      end: e.pageToScreen({ x: 780, y: 780 }),
    }
  })

  // The rectangle toolbar button lives behind tldraw's overflow popup in
  // this project's layout. Activate the geo tool directly — the pointer
  // pipeline below still drives the real state machine (pointing_shape →
  // creating → idle on pointerup).
  await page.evaluate(() => {
    const e = window.__editor
    if (!e) throw new Error("editor not mounted")
    e.setCurrentTool("geo")
  })

  await page.mouse.move(coords.start.x, coords.start.y)
  await page.mouse.down()
  await page.mouse.move(coords.mid.x, coords.mid.y, { steps: 4 })
  await page.mouse.move(coords.end.x, coords.end.y, { steps: 6 })

  // Before pointerup: current tool is still "geo" and its x/y/w/h are
  // changing tick by tick. Assert the pinned siblings stayed put.
  const midDrag = await page.evaluate((ids) => {
    const e = window.__editor
    if (!e) throw new Error("editor not mounted")
    const a = e.getShape(ids.aId as never)
    const b = e.getShape(ids.bId as never)
    const pin = e.getShape(ids.pinId as never)
    if (!a || !b || !pin) throw new Error("missing")
    return {
      toolId: e.getCurrentToolId(),
      a: { x: a.x, y: a.y },
      b: { x: b.x, y: b.y },
      pin: { x: pin.x, y: pin.y },
    }
  }, ids)

  expect(midDrag.toolId).not.toBe("select")
  expect(midDrag.a).toEqual({ x: 600, y: 600 })
  expect(midDrag.b).toEqual({ x: 640, y: 620 })
  expect(midDrag.pin).toEqual({ x: 660, y: 648 })

  await page.mouse.up()
})
