import { expect, test } from "@playwright/test"

test("Export PDF button downloads an annotated PDF of the sample", async ({
  page,
}) => {
  await page.goto("/")

  await page.getByRole("button", { name: "Use an example" }).click()
  await expect(page.locator(".tl-canvas")).toBeVisible({ timeout: 20_000 })

  // Wait for the editor hook and at least one PDF page image to be rendered
  // so renderAll has something to finish and the export isn't empty.
  await page.waitForFunction(
    () => {
      // biome-ignore lint/suspicious/noExplicitAny: test-only tldraw editor hook
      const e = (window as { __editor?: any }).__editor
      if (!e) return false
      return e
        .getCurrentPageShapes()
        .some((s: { type: string; meta?: Record<string, unknown> }) => {
          return s.type === "image" && typeof s.meta?.pdfPageIndex === "number"
        })
    },
    { timeout: 20_000 }
  )

  const exportButton = page.getByRole("button", { name: "Export PDF" })
  await expect(exportButton).toBeEnabled({ timeout: 20_000 })

  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 })
  await exportButton.click()

  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe("sample-annotated.pdf")
})
