#!/usr/bin/env node
// Enforces that no file under src/ or tests/ uses relative import paths.
// Biome 1.9.x lacks a native rule for this; this script fills the gap.
// Run via: node scripts/check-no-relative-imports.mjs
import { readFileSync, readdirSync, statSync } from "node:fs"
import { extname, join } from "node:path"

const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"])
const DIRS = ["src", "tests"]

function walk(dir) {
  const files = []
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        files.push(...walk(full))
      } else if (EXTS.has(extname(full))) {
        files.push(full)
      }
    }
  } catch {
    // dir doesn't exist — skip
  }
  return files
}

const RE = /(?:^|[\s,;{}()=])(?:from|import)\s*\(?\s*['"](\.[^'"]*)['"]/g

const offenders = []
for (const dir of DIRS) {
  for (const file of walk(dir)) {
    const lines = readFileSync(file, "utf8").split("\n")
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ""
      const trimmed = line.trimStart()
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue
      for (const m of line.matchAll(RE)) {
        const spec = m[1] ?? ""
        if (spec.startsWith("./") || spec.startsWith("../")) {
          offenders.push(`  ${file}:${i + 1}: ${line.trim()}`)
        }
      }
    }
  }
}

if (offenders.length > 0) {
  console.error(
    "error: relative imports are not allowed in src/ or tests/.\n" +
      "       Use the @/ path alias instead (e.g. @/tools/pin/pin-shape-util).\n"
  )
  for (const line of offenders) console.error(line)
  process.exit(1)
}
