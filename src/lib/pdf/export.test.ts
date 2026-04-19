import { describe, expect, it } from "vitest"
import { annotatedFilename } from "@/lib/pdf/export"

describe("annotatedFilename", () => {
  it("replaces a .pdf extension with -annotated.pdf", () => {
    expect(annotatedFilename("report.pdf")).toBe("report-annotated.pdf")
  })

  it("is case-insensitive on the .pdf extension", () => {
    expect(annotatedFilename("REPORT.PDF")).toBe("REPORT-annotated.pdf")
  })

  it("appends -annotated.pdf when no extension is present", () => {
    expect(annotatedFilename("notes")).toBe("notes-annotated.pdf")
  })

  it("does not strip non-.pdf extensions", () => {
    expect(annotatedFilename("notes.txt")).toBe("notes.txt-annotated.pdf")
  })

  it("trims surrounding whitespace", () => {
    expect(annotatedFilename("  report.pdf  ")).toBe("report-annotated.pdf")
  })

  it("falls back to document.pdf when the input is empty", () => {
    expect(annotatedFilename("")).toBe("document-annotated.pdf")
    expect(annotatedFilename("   ")).toBe("document-annotated.pdf")
  })
})
