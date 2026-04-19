import { expect, test } from "@playwright/test"

// Regression scenario for the dynamic-membership refactor: the pin is placed
// over 2 shapes, a 3rd is dragged into the pinned area later, then any drag
// of any member should move all three. The handler computes membership live
// on each afterChange, so a shape added after placement still joins the group.
test("pin picks up a shape dragged into its area after placement", async ({
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
    const aId = `shape:pb-a-${ts}`
    const bId = `shape:pb-b-${ts}`
    const cId = `shape:pb-c-${ts}`
    e.createShape({
      id: aId as never,
      type: "geo",
      x: 400,
      y: 400,
      props: { geo: "rectangle", w: 100, h: 80 },
    })
    e.createShape({
      id: bId as never,
      type: "geo",
      x: 430,
      y: 420,
      props: { geo: "rectangle", w: 100, h: 80 },
    })
    return { aId, bId, cId }
  })

  // Drop the pin via the real tool — exercises findShapesUnderPinTip and
  // the full pointer pipeline (matching pin-pdf-guard's approach).
  const screen = await page.evaluate(() => {
    const e = window.__editor
    if (!e) throw new Error("editor not mounted")
    return e.pageToScreen({ x: 470, y: 450 })
  })
  await page.getByRole("button", { name: "Pin", exact: true }).click()
  await page.mouse.click(screen.x, screen.y)

  // Add the third rectangle *after* the pin is placed, overlapping the
  // pin's tip. The static-binding version would miss this shape on drag;
  // the dynamic-membership version picks it up live.
  await page.evaluate((ids) => {
    const e = window.__editor
    if (!e) throw new Error("editor not mounted")
    e.createShape({
      id: ids.cId as never,
      type: "geo",
      x: 450,
      y: 440,
      props: { geo: "rectangle", w: 80, h: 60 },
    })
  }, ids)

  const result = await page.evaluate((ids) => {
    const e = window.__editor
    if (!e) throw new Error("editor not mounted")
    const a = e.getShape(ids.aId as never)
    const b = e.getShape(ids.bId as never)
    const c = e.getShape(ids.cId as never)
    const pin = e
      .getCurrentPageShapes()
      .find((s: { type: string }) => s.type === "pin")
    if (!a || !b || !c || !pin) throw new Error("shapes missing")
    const before = {
      a: { x: a.x, y: a.y },
      b: { x: b.x, y: b.y },
      c: { x: c.x, y: c.y },
      pin: { id: pin.id, x: pin.x, y: pin.y },
    }
    e.updateShapes([
      {
        id: ids.aId as never,
        type: "geo",
        x: before.a.x + 25,
        y: before.a.y + 10,
      },
    ])
    const pinAfter = e.getShape(before.pin.id)
    const bAfter = e.getShape(ids.bId as never)
    const cAfter = e.getShape(ids.cId as never)
    if (!pinAfter || !bAfter || !cAfter) throw new Error("shapes missing")
    return {
      bDelta: { x: bAfter.x - before.b.x, y: bAfter.y - before.b.y },
      cDelta: { x: cAfter.x - before.c.x, y: cAfter.y - before.c.y },
      pinDelta: {
        x: pinAfter.x - before.pin.x,
        y: pinAfter.y - before.pin.y,
      },
    }
  }, ids)

  expect(result.bDelta).toEqual({ x: 25, y: 10 })
  expect(result.cDelta).toEqual({ x: 25, y: 10 })
  expect(result.pinDelta).toEqual({ x: 25, y: 10 })
})
