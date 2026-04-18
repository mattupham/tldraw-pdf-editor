import { expect, test } from "@playwright/test"

// Regression for MATT-143: dropping a pin on the PDF page (and nothing else)
// must not attach the pin to the page image. Previously getShapesAtPoint
// included the locked PDF image shape, which meant every in-bounds drop
// silently attached to the page — and any stray drag of the page would carry
// every pin along with it.
test("pin dropped on the PDF page alone has empty attachedShapeIds", async ({
  page,
}) => {
  await page.goto("/")

  await page.getByRole("button", { name: "Use an example" }).click()

  // Wait for the PDF page shape to land in the store.
  await page.waitForFunction(
    () => {
      // biome-ignore lint/suspicious/noExplicitAny: test-only, tldraw shape union is too deep for intersection narrowing
      const e = (window as { __editor?: any }).__editor
      if (!e) return false
      return e
        .getCurrentPageShapes()
        .some(
          (s: { type: string; meta: { isPdfPage?: boolean } }) =>
            s.type === "image" && s.meta.isPdfPage === true
        )
    },
    { timeout: 25_000 }
  )

  // Use the pin tool programmatically (simulating the toolbar click is noisy
  // across platforms). setCurrentTool("pin") + dispatch(pointer_down) routes
  // through the same StateNode.onPointerDown logic a real pointer would.
  const pinId = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only tldraw hook
    const e = (window as { __editor?: any }).__editor
    if (!e) throw new Error("editor not mounted")

    const pdfShape = e
      .getCurrentPageShapes()
      // biome-ignore lint/suspicious/noExplicitAny: test-only narrowing
      .find((s: any) => s.type === "image" && s.meta.isPdfPage === true)
    if (!pdfShape) throw new Error("PDF page shape missing")

    const cx = pdfShape.x + pdfShape.props.w / 2
    const cy = pdfShape.y + pdfShape.props.h / 2

    e.setCurrentTool("pin")
    e.dispatch({
      type: "pointer",
      name: "pointer_down",
      target: "canvas",
      point: { x: cx, y: cy, z: 0.5 },
      pointerId: 1,
      button: 0,
      isPen: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      accelKey: false,
    })

    // biome-ignore lint/suspicious/noExplicitAny: test-only narrowing
    const pin = e.getCurrentPageShapes().find((s: any) => s.type === "pin")
    if (!pin) throw new Error("pin not created")
    return pin.id as string
  })

  const attached = await page.evaluate((id) => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only tldraw hook
    const e = (window as { __editor?: any }).__editor
    if (!e) throw new Error("editor not mounted")
    const pin = e.getShape(id)
    return pin.props.attachedShapeIds as string[]
  }, pinId)

  // The PDF page image must NOT be in the set. Since the test dropped on
  // the PDF alone (no user shapes), the set must be empty.
  expect(attached).toEqual([])
})
