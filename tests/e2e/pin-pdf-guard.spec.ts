import { expect, test } from "@playwright/test"

// Regression: dropping a pin on the PDF page (and nothing else) must not
// treat the page as a pin member. In the dynamic-membership model
// (pin-overlap.ts) the membership query filters out any image shape tagged
// with meta.pdfPageIndex / meta.isPdfPage — without that filter, every
// in-bounds pin drop would silently "attach" to the backdrop and drag it
// along through pin chains.
test("pin dropped on the PDF page alone has no non-PDF members", async ({
  page,
}) => {
  await page.goto("/")

  await page.getByRole("button", { name: "Use an example" }).click()

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
    const screen = e.pageToScreen(pageCenter)
    return { screen, pageCenter }
  })

  await page.getByRole("button", { name: "Pin", exact: true }).click()
  await page.mouse.click(target.screen.x, target.screen.y)

  // Compute the same membership query the attachment handler uses — shapes
  // whose bounds contain the pin's tip (plus the standard 6 px margin),
  // minus pins and PDF-page images. Expect an empty set: the PDF is the only
  // thing underneath and it's filtered.
  const result = await page.evaluate(() => {
    const e = window.__editor
    if (!e) throw new Error("editor not mounted")
    const pin = e.getCurrentPageShapes().find((s) => s.type === "pin")
    if (!pin) throw new Error("pin not created")

    const PIN_WIDTH = 24
    const PIN_HEIGHT = 32
    const MARGIN = 6
    const tip = { x: pin.x + PIN_WIDTH / 2, y: pin.y + PIN_HEIGHT }

    const memberIds = e
      .getCurrentPageShapes()
      .filter((s) => {
        if (s.type === "pin") return false
        if (s.type === "image" && typeof s.meta.pdfPageIndex === "number") {
          return false
        }
        const b = e.getShapePageBounds(s.id)
        if (!b) return false
        return (
          tip.x >= b.x - MARGIN &&
          tip.x <= b.x + b.w + MARGIN &&
          tip.y >= b.y - MARGIN &&
          tip.y <= b.y + b.h + MARGIN
        )
      })
      .map((s) => s.id)

    return { memberIds }
  })

  expect(result.memberIds).toEqual([])
})
