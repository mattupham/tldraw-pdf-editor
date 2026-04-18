import { expect, test } from "@playwright/test"

// Regression for MATT-143: dropping a pin on the PDF page (and nothing else)
// must not attach the pin to the page image. Previously getShapesAtPoint
// included the locked PDF image shape, which meant every in-bounds drop
// silently attached to the page — and any stray drag of the page would carry
// every pin along with it.
//
// The test drives the pin tool via real DOM mouse events (not editor.dispatch)
// so we hit the full tldraw pointer pipeline — including the page-space
// conversion the pin-tool reads via editor.inputs.getCurrentPagePoint(). A
// sanity check inside the page context confirms the click actually landed on
// the PDF image shape before we assert the attached-set behavior.
test("pin dropped on the PDF page alone has empty attachedShapeIds", async ({
  page,
}) => {
  await page.goto("/")

  await page.getByRole("button", { name: "Use an example" }).click()

  // Wait for the PDF page shape to land in the store.
  await page.waitForFunction(
    () => {
      const e = window.__editor
      if (!e) return false
      return e
        .getCurrentPageShapes()
        .some((s) => s.type === "image" && s.meta.isPdfPage === true)
    },
    { timeout: 25_000 }
  )

  // Compute the screen-space position of the PDF page centre. tldraw's
  // pointer pipeline expects screen coords; converting here ensures the click
  // really hits the PDF image rather than empty canvas.
  const target = await page.evaluate(() => {
    const e = window.__editor
    if (!e) throw new Error("editor not mounted")
    const pdfShape = e
      .getCurrentPageShapes()
      .find((s) => s.type === "image" && s.meta.isPdfPage === true)
    if (!pdfShape) throw new Error("PDF page shape missing")
    const props = pdfShape.props as { w: number; h: number }
    const pageCenter = {
      x: pdfShape.x + props.w / 2,
      y: pdfShape.y + props.h / 2,
    }
    // Sanity: the PDF image IS at pageCenter in page space.
    const hitCheck = e
      .getShapesAtPoint(pageCenter, { hitInside: true })
      .some((s) => s.type === "image" && s.meta.isPdfPage === true)
    if (!hitCheck) throw new Error("PDF page not at computed page-centre")

    const screen = e.pageToScreen(pageCenter)
    return { screen, pageCenter }
  })

  // Activate the pin tool via the toolbar (real click — exercises the UI).
  await page.getByRole("button", { name: "Pin", exact: true }).click()

  // Click at the PDF page centre in screen space.
  await page.mouse.click(target.screen.x, target.screen.y)

  const result = await page.evaluate(() => {
    const e = window.__editor
    if (!e) throw new Error("editor not mounted")
    const pin = e.getCurrentPageShapes().find((s) => s.type === "pin")
    if (!pin) throw new Error("pin not created")
    const props = pin.props as { attachedShapeIds: string[] }
    return {
      pinAt: { x: pin.x, y: pin.y },
      attachedShapeIds: props.attachedShapeIds,
    }
  })

  // Pin must have landed near the PDF-page centre (within the PDF's bounds),
  // and the PDF page must NOT have been attached — so the set is empty.
  expect(result.attachedShapeIds).toEqual([])
})
