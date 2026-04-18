import { expect, test } from "@playwright/test"

test("pin and attached shapes translate by the same delta", async ({
  page,
}) => {
  await page.goto("/")

  // Load example PDF so tldraw canvas mounts
  await page.getByRole("button", { name: "Use an example" }).click()

  // Wait for the dev-mode editor hook to be set
  await page.waitForFunction(
    () => !!(window as { __editor?: unknown }).__editor,
    { timeout: 20_000 }
  )

  // Create two overlapping geo shapes and a pin attached to both
  const ids = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only tldraw editor hook
    const e = (window as { __editor?: any }).__editor
    const ts = Date.now()
    const idA = `shape:pe-a-${ts}`
    const idB = `shape:pe-b-${ts}`
    const idPin = `shape:pe-pin-${ts}`

    e.createShapes([
      { id: idA, type: "geo", x: 100, y: 100, props: { w: 200, h: 200 } },
      { id: idB, type: "geo", x: 150, y: 150, props: { w: 200, h: 200 } },
    ])
    e.createShape({
      id: idPin,
      type: "pin",
      x: 160,
      y: 148,
      props: { attachedShapeIds: [idA, idB] },
    })

    return { idA, idB, idPin }
  })

  // Move shape A by dx=50, dy=30.
  // Wrapped in editor.run() to match tldraw's normal pointer-event batch context —
  // calling updateShape bare triggers flushAtomicCallbacks re-entrancy.
  await page.evaluate(({ idA }) => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only tldraw editor hook
    const e = (window as { __editor?: any }).__editor
    const shape = e.getShape(idA)
    e.run(() => {
      e.updateShape({ id: idA, type: "geo", x: shape.x + 50, y: shape.y + 30 })
    })
  }, ids)

  // Give React / tldraw side-effects a tick to settle
  await page.waitForTimeout(100)

  const result = await page.evaluate(({ idA, idB, idPin }) => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only tldraw editor hook
    const e = (window as { __editor?: any }).__editor
    return {
      a: { x: e.getShape(idA).x, y: e.getShape(idA).y },
      b: { x: e.getShape(idB).x, y: e.getShape(idB).y },
      pin: { x: e.getShape(idPin).x, y: e.getShape(idPin).y },
    }
  }, ids)

  // A moved by (+50, +30) → B and pin must carry the same delta
  expect(result.a.x - 100).toBe(50)
  expect(result.a.y - 100).toBe(30)
  expect(result.b.x - 150).toBe(50)
  expect(result.b.y - 150).toBe(30)
  expect(result.pin.x - 160).toBe(50)
  expect(result.pin.y - 148).toBe(30)
})
