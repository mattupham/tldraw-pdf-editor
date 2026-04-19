import { describe, expect, it, vi } from "vitest"

// Capture the data passed to getDocument so we can assert openPdf cloned it.
const { getDocumentCalls } = vi.hoisted(() => ({
  getDocumentCalls: [] as Array<{ data: Uint8Array }>,
}))

// Mock pdfjs-dist before it is dynamically imported inside render.ts.
// This avoids DOMMatrix and other browser globals that crash in node.
vi.mock("pdfjs-dist", () => {
  const mockPage = {
    getViewport: () => ({ width: 200, height: 300 }),
    render: () => ({ promise: Promise.resolve() }),
  }
  return {
    GlobalWorkerOptions: { workerSrc: "" },
    getDocument: (args: { data: Uint8Array }) => {
      getDocumentCalls.push(args)
      return {
        promise: Promise.resolve({
          numPages: 3,
          getPage: () => Promise.resolve(mockPage),
        }),
      }
    },
  }
})

// Stub browser globals consumed inside renderPage
vi.stubGlobal("devicePixelRatio", 1)
vi.stubGlobal(
  "OffscreenCanvas",
  class MockOffscreenCanvas {
    constructor(
      public width: number,
      public height: number
    ) {}
    getContext() {
      return {}
    }
    convertToBlob() {
      return Promise.resolve(new Blob(["px"], { type: "image/png" }))
    }
  }
)

// Import after mocks are in place
const { openPdf, renderPage, extendLayout, extendLayoutToY } = await import(
  "@/lib/pdf/render"
)

describe("openPdf", () => {
  it("passes a cloned Uint8Array to pdfjs, preserving the caller's buffer", async () => {
    const before = getDocumentCalls.length
    const input = new Uint8Array([37, 80, 68, 70]) // '%PDF'

    await openPdf(input)

    const call = getDocumentCalls[before]
    expect(call).toBeDefined()
    // pdfjs transfers and detaches the ArrayBuffer it receives, so openPdf
    // must hand it a fresh copy — not the caller's view.
    expect(call?.data).not.toBe(input)
    expect(call?.data.buffer).not.toBe(input.buffer)
    expect(Array.from(call?.data ?? [])).toEqual([37, 80, 68, 70])
  })
})

describe("extendLayout", () => {
  it("fills in missing layout entries up to the target index", async () => {
    const pdf = await openPdf(new Uint8Array([37, 80, 68, 70]))
    const layout: Array<{ w: number; h: number; x: number; y: number }> = []

    await extendLayout(pdf, layout, 1)

    expect(layout).toHaveLength(2)
    // Page 1 at y=0, page 2 stacked below (GUTTER=20 internal constant).
    expect(layout[0]).toEqual({ w: 200, h: 300, x: -100, y: 0 })
    expect(layout[1]).toEqual({ w: 200, h: 300, x: -100, y: 320 })
  })

  it("is idempotent — calling with a target already covered is a no-op", async () => {
    const pdf = await openPdf(new Uint8Array([37, 80, 68, 70]))
    const layout: Array<{ w: number; h: number; x: number; y: number }> = []

    await extendLayout(pdf, layout, 1)
    const before = layout.slice()
    await extendLayout(pdf, layout, 0) // already covered
    expect(layout).toEqual(before)
  })

  it("clamps to the document's page count", async () => {
    // Mock returns numPages=3; asking for index 99 should stop at 2.
    const pdf = await openPdf(new Uint8Array([37, 80, 68, 70]))
    const layout: Array<{ w: number; h: number; x: number; y: number }> = []

    await extendLayout(pdf, layout, 99)

    expect(layout).toHaveLength(pdf.numPages)
  })
})

describe("extendLayoutToY", () => {
  it("stops once the cumulative y-extent covers the target", async () => {
    const pdf = await openPdf(new Uint8Array([37, 80, 68, 70]))
    const layout: Array<{ w: number; h: number; x: number; y: number }> = []

    // Each page is 300 high + 20 gutter. Target y=500 → need 2 pages
    // (page 1 bottom at y=300, page 2 bottom at y=620 — covers 500).
    await extendLayoutToY(pdf, layout, 500)

    expect(layout).toHaveLength(2)
  })

  it("stops at the document end if the target exceeds the deck", async () => {
    const pdf = await openPdf(new Uint8Array([37, 80, 68, 70]))
    const layout: Array<{ w: number; h: number; x: number; y: number }> = []

    await extendLayoutToY(pdf, layout, 1_000_000)

    expect(layout).toHaveLength(pdf.numPages)
  })
})

describe("renderPage", () => {
  it("returns a Blob for every page in a multi-page PDF fixture", async () => {
    // Use a minimal byte buffer — getDocument is mocked and ignores the input
    const pdf = await openPdf(new Uint8Array([37, 80, 68, 70])) // '%PDF' magic bytes

    const blobs = await Promise.all(
      Array.from({ length: pdf.numPages }, (_, i) => renderPage(pdf, i + 1))
    )

    expect(blobs).toHaveLength(pdf.numPages) // blobs.length === pageCount
    expect(blobs.every((b) => b instanceof Blob)).toBe(true)
    expect(blobs.every((b) => b.type === "image/png")).toBe(true)
  })

  it("respects the dprCap option", async () => {
    const pdf = await openPdf(new Uint8Array([37, 80, 68, 70]))
    // dprCap=1 with devicePixelRatio=1 → scale = min(1*2, 1) = 1
    const blob = await renderPage(pdf, 1, { dprCap: 1 })
    expect(blob).toBeInstanceOf(Blob)
  })
})
