"use client"

import { CameraTool } from "@/tools/camera/camera-tool"
import { CropOverlay } from "@/tools/camera/crop-overlay"
import { createContext, useContext, useMemo, useState } from "react"
import { type Editor, Tldraw } from "tldraw"

const EditorContext = createContext<Editor | null>(null)

export function useEditor(): Editor | null {
  return useContext(EditorContext)
}

const TOOLS = [CameraTool]

export default function Canvas({
  children,
}: {
  children?: React.ReactNode
}) {
  const [editor, setEditor] = useState<Editor | null>(null)

  const components = useMemo(() => ({ InFrontOfTheCanvas: CropOverlay }), [])

  return (
    <EditorContext.Provider value={editor}>
      <div className="fixed inset-0">
        <Tldraw onMount={setEditor} tools={TOOLS} components={components} />
      </div>
      {children}
    </EditorContext.Provider>
  )
}
