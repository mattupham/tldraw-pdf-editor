import { expect, test } from "@playwright/test"

test("camera marquee triggers PNG download", async ({ page }) => {
  await page.goto("/")

  // Load example PDF so tldraw canvas mounts
  await page.getByRole("button", { name: "Use an example" }).click()
  await expect(page.locator(".tl-canvas")).toBeVisible({ timeout: 20_000 })

  // Wait for the dev-mode editor hook
  await page.waitForFunction(
    () => !!(window as { __editor?: unknown }).__editor,
    { timeout: 15_000 }
  )

  // Zoom to fit so that canvas content is visible in the viewport
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only tldraw editor hook
    const e = (window as { __editor?: any }).__editor
    e.zoomToFit({ animation: { duration: 0 } })
  })

  await page.waitForTimeout(100)

  // Activate camera tool via the toolbar button
  await page
    .getByRole("button", { name: "Camera tool: drag to crop and export" })
    .click()

  const viewport = page.viewportSize() ?? { width: 1280, height: 720 }
  const cx = viewport.width / 2
  const cy = viewport.height / 2

  // Arm the download listener before the action that triggers it
  const downloadPromise = page.waitForEvent("download", { timeout: 20_000 })

  // Draw a 160×120 px marquee centred in the viewport
  await page.mouse.move(cx - 80, cy - 60)
  await page.mouse.down()
  await page.mouse.move(cx + 80, cy + 60, { steps: 10 })
  await page.mouse.up()

  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe("screenshot.png")
})
