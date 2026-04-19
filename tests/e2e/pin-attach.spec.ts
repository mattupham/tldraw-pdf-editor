import { expect, test } from "@playwright/test"

// Dynamic-membership pin: the pin doesn't store attachedShapeIds. Each test
// positions a pin so its tip sits inside the overlap of the target shapes —
// findShapesUnderPinTip then picks them up on every drag.

test("pin and attached shapes translate by the same delta", async ({
  page,
}) => {
  await page.goto("/")

  await page.getByRole("button", { name: "Use an example" }).click()

  await page.waitForFunction(
    () => !!(window as { __editor?: unknown }).__editor,
    { timeout: 20_000 }
  )

  const ids = await page.evaluate(() => {
    const e = window.__editor
    if (!e) throw new Error("editor not mounted")
    const ts = Date.now()
    const idA = `shape:pe-a-${ts}` as unknown as string
    const idB = `shape:pe-b-${ts}` as unknown as string
    const idPin = `shape:pe-pin-${ts}` as unknown as string

    e.createShapes([
      {
        id: idA as never,
        type: "geo",
        x: 100,
        y: 100,
        props: { w: 200, h: 200 },
      },
      {
        id: idB as never,
        type: "geo",
        x: 150,
        y: 150,
        props: { w: 200, h: 200 },
      },
    ])
    // Pin tip = (pin.x + 12, pin.y + 32) = (172, 180), inside both shapes.
    e.createShape({
      id: idPin as never,
      type: "pin",
      x: 160,
      y: 148,
      props: {},
    })

    return { idA, idB, idPin }
  })

  await page.evaluate(({ idA }) => {
    const e = window.__editor
    if (!e) throw new Error("editor not mounted")
    const shape = e.getShape(idA as never)
    if (!shape) throw new Error("shape A missing")
    e.run(() => {
      e.updateShape({
        id: idA as never,
        type: "geo",
        x: shape.x + 50,
        y: shape.y + 30,
      })
    })
  }, ids)

  await page.waitForTimeout(100)

  const result = await page.evaluate(({ idA, idB, idPin }) => {
    const e = window.__editor
    if (!e) throw new Error("editor not mounted")
    const a = e.getShape(idA as never)
    const b = e.getShape(idB as never)
    const p = e.getShape(idPin as never)
    if (!a || !b || !p) throw new Error("shapes missing")
    return {
      a: { x: a.x, y: a.y },
      b: { x: b.x, y: b.y },
      pin: { x: p.x, y: p.y },
    }
  }, ids)

  expect(result.a.x - 100).toBe(50)
  expect(result.a.y - 100).toBe(30)
  expect(result.b.x - 150).toBe(50)
  expect(result.b.y - 150).toBe(30)
  expect(result.pin.x - 160).toBe(50)
  expect(result.pin.y - 148).toBe(30)
})

test("resizing an attached shape does not drag the pin or siblings", async ({
  page,
}) => {
  await page.goto("/")

  await page.getByRole("button", { name: "Use an example" }).click()

  await page.waitForFunction(
    () => !!(window as { __editor?: unknown }).__editor,
    { timeout: 20_000 }
  )

  const ids = await page.evaluate(() => {
    const e = window.__editor
    if (!e) throw new Error("editor not mounted")
    const ts = Date.now()
    const idA = `shape:rz-a-${ts}`
    const idB = `shape:rz-b-${ts}`
    const idPin = `shape:rz-pin-${ts}`

    e.createShapes([
      {
        id: idA as never,
        type: "geo",
        x: 400,
        y: 400,
        props: { w: 200, h: 200 },
      },
      {
        id: idB as never,
        type: "geo",
        x: 450,
        y: 450,
        props: { w: 200, h: 200 },
      },
    ])
    e.createShape({
      id: idPin as never,
      type: "pin",
      x: 460,
      y: 448,
      props: {},
    })

    return { idA, idB, idPin }
  })

  await page.evaluate(({ idA }) => {
    const e = window.__editor
    if (!e) throw new Error("editor not mounted")
    const shape = e.getShape(idA as never)
    if (!shape) throw new Error("shape A missing")
    e.run(() => {
      e.updateShape({
        id: idA as never,
        type: "geo",
        x: shape.x - 20,
        y: shape.y - 20,
        props: {
          w: (shape.props as { w: number }).w + 20,
          h: (shape.props as { h: number }).h + 20,
        },
      })
    })
  }, ids)

  await page.waitForTimeout(100)

  const result = await page.evaluate(({ idA, idB, idPin }) => {
    const e = window.__editor
    if (!e) throw new Error("editor not mounted")
    const a = e.getShape(idA as never)
    const b = e.getShape(idB as never)
    const p = e.getShape(idPin as never)
    if (!a || !b || !p) throw new Error("shapes missing")
    return {
      a: { x: a.x, y: a.y },
      b: { x: b.x, y: b.y },
      pin: { x: p.x, y: p.y },
    }
  }, ids)

  expect(result.a.x).toBe(380)
  expect(result.a.y).toBe(380)
  expect(result.b.x).toBe(450)
  expect(result.b.y).toBe(450)
  expect(result.pin.x).toBe(460)
  expect(result.pin.y).toBe(448)
})
