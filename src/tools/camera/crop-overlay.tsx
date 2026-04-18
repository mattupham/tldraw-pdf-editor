"use client"

import { useEditor, useValue } from "tldraw"
import { cropStateAtom } from "@/tools/camera/camera-tool"

export function CropOverlay() {
  const editor = useEditor()

  const rect = useValue("cropRect", () => {
    const state = cropStateAtom.get()
    if (state.status !== "dragging") return null
    const s = editor.pageToScreen({ x: state.startX, y: state.startY })
    const e = editor.pageToScreen({ x: state.currentX, y: state.currentY })
    return {
      x: Math.min(s.x, e.x),
      y: Math.min(s.y, e.y),
      w: Math.abs(e.x - s.x),
      h: Math.abs(e.y - s.y),
    }
  }, [editor])

  if (!rect) return null

  return (
    <svg
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      {/* shadow stroke for contrast */}
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        fill="rgba(0,0,0,0.1)"
        stroke="rgba(0,0,0,0.5)"
        strokeWidth={3}
        strokeDasharray="8 4"
      />
      {/* white marching-ants stroke — animation defined in globals.css */}
      <rect
        className="tl-camera-marquee"
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        fill="none"
        stroke="white"
        strokeWidth={1.5}
        strokeDasharray="8 4"
      />
    </svg>
  )
}
