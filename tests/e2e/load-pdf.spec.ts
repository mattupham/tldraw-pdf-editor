import { expect, test } from "@playwright/test"

test("Use an example mounts canvas with PDF page shapes", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "Use an example" }).click()

  // Wait for the editor to mount AND for at least one PDF page shape to appear
  await page.waitForFunction(
    () => {
      // biome-ignore lint/suspicious/noExplicitAny: test-only tldraw editor hook
      const e = (window as { __editor?: any }).__editor
      if (!e) return false
      return e.getCurrentPageShapes().length > 0
    },
    { timeout: 25_000 }
  )

  const count = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only tldraw editor hook
    const e = (window as { __editor?: any }).__editor
    return e.getCurrentPageShapes().length
  })
  expect(count).toBeGreaterThan(0)
})
