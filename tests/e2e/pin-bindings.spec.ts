import { expect, test } from "@playwright/test"

// biome-ignore lint/suspicious/noExplicitAny: test-only tldraw editor hook
type TldrawEditor = any

async function waitForEditor(page: import("@playwright/test").Page) {
  await page.waitForFunction(
    () => !!(window as { __editor?: unknown }).__editor,
    { timeout: 15_000 }
  )
}

function getEditor() {
  return (window as { __editor?: TldrawEditor }).__editor as TldrawEditor
}

// Regression scenario driven by the dynamic-membership refactor: the pin is
// placed over 2 shapes, a 3rd is dragged into the pinned area later, then any
// drag of any member should move all three.
test("pin picks up a shape dragged into its area after placement", async ({
  page,
}) => {
  await page.goto("/")

  await page.getByRole("button", { name: "Use an example" }).click()
  await expect(page.locator(".tl-canvas")).toBeVisible({ timeout: 20_000 })
  await waitForEditor(page)

  // Create two overlapping rectangles, centred on a fixed page point.
  const ids = await page.evaluate(() => {
    const e = getEditor()
    const aId = `shape:a-${Math.random().toString(36).slice(2)}`
    const bId = `shape:b-${Math.random().toString(36).slice(2)}`
    const cId = `shape:c-${Math.random().toString(36).slice(2)}`
    e.createShape({
      id: aId,
      type: "geo",
      x: 400,
      y: 400,
      props: { geo: "rectangle", w: 100, h: 80 },
    })
    e.createShape({
      id: bId,
      type: "geo",
      x: 430,
      y: 420,
      props: { geo: "rectangle", w: 100, h: 80 },
    })
    return { aId, bId, cId }
  })

  // Drop the pin via the pin tool so we exercise the real StateNode path.
  await page.evaluate(() => {
    const e = getEditor()
    e.setCurrentTool("pin")
    const pagePoint = { x: 470, y: 450 }
    e.inputs.currentPagePoint = pagePoint
    e.dispatch({
      type: "pointer",
      name: "pointer_down",
      point: pagePoint,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      pointerId: 1,
      button: 0,
      isPen: false,
      target: "canvas",
    })
  })

  // Now add the third rectangle *after* the pin is placed, overlapping the
  // pin's tip. The old (static) implementation would miss this shape on drag;
  // the dynamic implementation picks it up.
  await page.evaluate((ids) => {
    const e = getEditor()
    e.createShape({
      id: ids.cId,
      type: "geo",
      x: 450,
      y: 440,
      props: { geo: "rectangle", w: 80, h: 60 },
    })
  }, ids)

  // Drag shape A via the store and assert B, C, and the pin all moved by the
  // same delta — i.e. C was picked up despite being added after the pin.
  const result = await page.evaluate((ids) => {
    const e = getEditor()
    const before = {
      a: e.getShape(ids.aId),
      b: e.getShape(ids.bId),
      c: e.getShape(ids.cId),
      pin: e
        .getCurrentPageShapes()
        .find((s: { type: string }) => s.type === "pin"),
    }
    e.updateShapes([
      {
        id: ids.aId,
        type: "geo",
        x: before.a.x + 25,
        y: before.a.y + 10,
      },
    ])
    const after = {
      a: e.getShape(ids.aId),
      b: e.getShape(ids.bId),
      c: e.getShape(ids.cId),
      pin: e.getShape(before.pin.id),
    }
    return {
      bDelta: { x: after.b.x - before.b.x, y: after.b.y - before.b.y },
      cDelta: { x: after.c.x - before.c.x, y: after.c.y - before.c.y },
      pinDelta: {
        x: after.pin.x - before.pin.x,
        y: after.pin.y - before.pin.y,
      },
    }
  }, ids)

  expect(result.bDelta).toEqual({ x: 25, y: 10 })
  expect(result.cDelta).toEqual({ x: 25, y: 10 })
  expect(result.pinDelta).toEqual({ x: 25, y: 10 })
})
